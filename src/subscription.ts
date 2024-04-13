import dotenv from 'dotenv'
import { BskyAgent } from '@atproto/api'
import { QueryParams as QueryParamsSearch } from './lexicon/types/app/bsky/feed/searchPosts'
import { Database } from './db'
import { PostView } from './lexicon/types/app/bsky/feed/defs'
import fetch from 'node-fetch'
import * as pkg from "../package.json"

export function appVersion(): string {
    return pkg.version;
}

type record = {
  createdAt: string
  text?: string
  langs?: string[]
  reply: {}
  embed?: {
    images?: imageObject[]
  }
}

type imageObject = {
  alt: string
  aspectRatio: {
    height: number
    width: number
  }
  fullsize: string
  thumb: string
}

export class ScpecificActorsSubscription {
  agent: BskyAgent

  constructor(public db: Database) {
    this.agent = new BskyAgent({
      service: 'https://bsky.social'
    })

  }

  async run() {
    //Admin Console経由でD1に保存された検索条件を取得
    const adminConsoleEndpoint = process.env.STARRYSKY_ADMIN_CONSOLE || 'https://starrysky-console.pages.dev'
    let serverUrl
    if (process.env.FEEDGEN_HOSTNAME === 'example.com') {
      serverUrl = 'http://localhost:' + process.env.FEEDGEN_PORT
    } else {
      serverUrl = 'https://' + process.env.FEEDGEN_HOSTNAME
    }

    console.log('Starrysky Query Engine:'+appVersion())
    console.log('Query Engine URL is ' + serverUrl)
    console.log('Admin Console URL is ' + adminConsoleEndpoint)


    if (process.env.FEEDGEN_HOSTNAME !== 'example.com') {
      try {
        const result = await fetch(adminConsoleEndpoint + "/api/getD1Query",
          {
            method: 'post', headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ serverUrl: serverUrl })
          }
        );

        const resultObject = await result.json()

        if (resultObject.result === 'OK') {
          for (let record of resultObject.resultRecord) {
            let obj = {
              key: record.key || '',
              recordName: record.recordName || '',
              query: record.query || '',
              inputRegex: record.inputRegex || '',
              invertRegex: record.invertRegex,
              refresh: record.refresh || 0,
              lang: record.lang,
              labelDisable: record.labelDisable,
              replyDisable: record.replyDisable,
              imageOnly: record.imageOnly,
              initPost: record.initPost || 100,
              pinnedPost: record.pinnedPost,
              limitCount: record.limitCount || 2000,
              feedAvatar: record.feedAvatar,
              feedName: record.feedName,
              feedDescription: record.feedDescription,
              includeAltText: record.includeAltText,
              profileMatch: record.profileMatch,
              recordCount: 0
            }

            await this.db
              .insertInto('conditions')
              .values(obj)
              .onConflict(oc => oc.doNothing())
              .execute()

            console.log('Admin Consoleから検索条件を復元しました：' + record.key)


          }
        }
      } catch (e) {
        console.error('Admin Consoleへ接続できず、検索条件は復元できませんでした。' + e)
      }
    } else {
      console.log('example.comが指定されているので、検索条件は復元しませんでした')

    }

    await this.reload()
  }

  async reload() {
    dotenv.config()

    //ログイン
    if (!this.agent.hasSession) {
      if (this.agent.session !== undefined) {
        await this.agent.resumeSession(this.agent.session)
      } else {
        await this.agent.login({
          identifier: process.env.FEEDGEN_PUBLISHER_IDENTIFIER || '',
          password: process.env.FEEDGEN_APP_PASSWORD || ''
        })
      }
    }

    //検索条件取得
    let conditionBuiler = this.db
      .selectFrom('conditions')
      .selectAll()
    const confitionRes = await conditionBuiler.execute()

    if (confitionRes.length === 0) console.log('Query Engineには検索条件は登録されていません。Admin Consoleから登録してください。There is no conditions.')

    for (let obj of confitionRes) {

      try {
        if (obj.refresh !== 0) {
          console.log('Refresh mode:')

          if (obj.refresh === -1) {
            this.db
              .deleteFrom('post')
              .where('key', '=', obj.key)
              .execute()

          } else if (obj.refresh > 0) {
            this.db
              .deleteFrom('post')
              .orderBy('indexedAt', 'desc')
              .where('key', '=', obj.key)
              .limit(obj.refresh)
              .execute()
          }

          let updateObj = {
            refresh: 0,
          }
          this.db
            .updateTable('conditions')
            .set(updateObj)
            .where('key', '=', obj.key)
            .execute()
        }

        //保存されている全投稿取得
        let builder = this.db
          .selectFrom('post')
          .selectAll()
          .where('key', '=', obj.key)
          .orderBy('indexedAt', 'desc')
        const res = await builder.execute()
        const storedPost = res.map((subsc) => subsc.uri)
        let init = false
        let catchUp = false

        //件数ゼロなら初回起動モード
        if (res.length === 0) {
          init = true
          console.log('#####[' + obj.key + '] Initial job run.')
          //1件でも入っていれば差分起動モード
        } else {
          console.log('#####[' + obj.key + ']. Delta job run. Current post count:' + res.length)
        }

        const query = obj.query
        const inputRegexText = obj.inputRegex
        const invertRegexText = obj.invertRegex || ''
        const label = obj.labelDisable    //センシティブラベル付き投稿表示制御用フラグ
        const reply = obj.replyDisable    //リプライ表示抑制用フラグ
        const alt = obj.includeAltText    //画像のALT文字列検索可否フラグ
        const image = obj.imageOnly       //画像のみ抽出フラグ
        const lang = obj.lang?.split(',') //言語フィルタ用配列
        const pinnedPost = process.env.FEEDGEN_PINNED_POST || ''       //言語フィルタ用配列
        const initCount = obj.initPost || 100  //初期起動時の読み込み件数
        const profileMatch = obj.profileMatch || ''  //プロフィールマッチ

        const inputRegex = new RegExp(inputRegexText, 'ig')  //抽出正規表現
        const invertRegex = new RegExp(invertRegexText, 'i') //除外用正規表現

        let recordcount = 0;
        let posts: PostView[] = []
        let cursor = 0
        let apiCall = 0
        const startTime = Date.now(); // 開始時間

        if (process.env.DEBUG_MODE) {
          console.log('query:' + query)
          console.log('inputRegexText:' + inputRegexText)
          console.log('invertRegexText:' + invertRegexText)
        }

        //言語フィルタ
        let searchQuery = query
        if (lang) {
          searchQuery = searchQuery + ' lang:' + lang
        }

        //初回起動モードは既定の件数まで処理を継続
        //差分起動モードは前回の実行に追いつくまで処理を継続
        //ただし、API検索が100回に到達する、または、APIの検索が終了した場合は処理を止める
        while (((!init && !catchUp) || (init && recordcount < initCount)) && cursor % 100 == 0 && apiCall < 100) {
          //検索API実行
          const params_search: QueryParamsSearch = {
            q: searchQuery,
            limit: 100,
            cursor: String(cursor)
          }
          const seachResults = await this.agent.api.app.bsky.feed.searchPosts(params_search)
          apiCall++

          //念のため検索件数をログだし
          cursor = Number(seachResults.data.cursor)
          console.log('API cursor:' + cursor + '(' + apiCall + '). Current post count:' + recordcount)

          let profileDID: string[] = []
          const userProfileStringsMap = new Map<string, string>()
          let profileCounts = 0

          if (profileMatch !== undefined && profileMatch !== "") {

            for (let post of seachResults.data.posts) {
              profileCounts++

              if (!userProfileStringsMap.get(post.author.did)) {
                profileDID.push(post.author.did)
              }

              //DIDが25件に達した、または、現在の処理件数が投稿件数に一致した場合。ただし、上限に達したが検索用DID配列が空の場合は処理をしない
              if ((profileDID.length == 25 || seachResults.data.posts.length == profileCounts) && profileDID.length != 0) {
                //プロフィール取得
                const profileResult = await this.agent.app.bsky.actor.getProfiles({
                  actors: profileDID
                })

                for (let profile of profileResult.data.profiles) {
                  userProfileStringsMap.set(profile.did, profile.displayName + ' ' + profile.description)
                }

                profileDID = []

              }
            }
          }

          for (let post of seachResults.data.posts) {

            //前回実行分に追いついた
            if (storedPost.includes(post.uri)) {
              console.log('Catch up finished. URI:' + post.uri)
              catchUp = true
              break
            }

            const record = post.record as record
            let text = record.text || ''

            // 検索APIがALT TEXTの検索ができないので削除
            if (alt === "true" && record.embed !== undefined && record.embed.images !== undefined) {
              for (let image of record.embed.images) {
                text = text + '\n' + image.alt
              }
            }

            //INPUTにマッチしないものは除外
            const matches = (text.match(inputRegex) || []).length
            if (matches == 0) {
              continue
            }

            //Invertにマッチしたものは除外
            if (invertRegexText !== '' && text.match(invertRegex)) {
              continue
            }

            //画像フィルタ
            const imageObject = post.embed?.images as imageObject[]
            if (image === 'imageOnly' && imageObject === undefined) {
              continue
            } else if (image === 'textOnly' && imageObject !== undefined && imageObject.length > 0) {
              continue
            }

            //ラベルが有効な場合は、ラベルが何かついていたら除外
            if (label === "true" && post.labels?.length !== 0) {
              continue
            }

            //リプライ無効の場合は、リプライを除外
            if (reply === "true" && record.reply !== undefined) {
              continue
            }

            //プロファイルマッチが有効化されており、かつ、検索ワードの1つにしか合致していない
            let skip = false
            if (profileMatch !== undefined && profileMatch !== "") {
              const [textTerm, profileRegexText] = profileMatch.split('::')
              const textTermRegex = new RegExp(textTerm || '', 'ig')       //プロフィールマッチ用正規表現
              const profileRegex = new RegExp(profileRegexText || '', 'i')//除外用正規表現

              const matchesWithProfile = (text.match(textTermRegex) || []).length

              if (process.env.DEBUG_MODE) {
                console.log('text:' + text)
                console.log('matchesWithProfile:' + text.match(textTermRegex) + '  matches:' + matches)
              }

              //プロフィールマッチ用の文言が含まれている、かつ、プロフィールマッチ以外の文言が含まれていない場合
              if (matchesWithProfile > 0 && (matches - matchesWithProfile) == 0) {
                //const profileText = userProfileStringsMap.get(post.author.did) + ' ' + text
                const profileText = userProfileStringsMap.get(post.author.did) || ''

                if (process.env.DEBUG_MODE) {
                  console.log(profileText.match(profileRegex))
                }

                //指定された文字が投稿本文に含まれる場合は、Regex指定された文字列がプロフィールになければ除外
                if (!profileText.match(profileRegex)) {
                  skip = true
                  continue
                }
              }
            }

            if (skip) continue

            //投稿をDBに保存
            recordcount++

            const postsToCreate = {
              uri: post.uri,
              key: obj.key,
              cid: post.cid,
              // indexedAt: new Date().toISOString(),
              indexedAt: record.createdAt
            }
            await this.db
              .insertInto('post')
              .values(postsToCreate)
              .onConflict(oc => oc.doNothing())
              .execute()
          }
        }

        const endTime = Date.now(); // 終了時間
        console.log('#####[' + obj.key + '] Fetch job finished. Current job captured:' + recordcount + '. Time:' + (endTime - startTime) + 'ms')

        let updateObj = {
          lastExecTime: (endTime - startTime) + 'ms',
          recordCount: recordcount + res.length
        }


        if (updateObj.recordCount > obj.limitCount) {
          const deletePost = updateObj.recordCount - obj.limitCount

          console.log('Limit:[' + obj.limitCount + '] delete post counts:' + deletePost)

          this.db
            .deleteFrom('post')
            .orderBy('indexedAt', 'asc')
            .where('key', '=', obj.key)
            .limit(deletePost)
            .execute()

          updateObj.recordCount = obj.limitCount

        }


        this.db
          .updateTable('conditions')
          .set(updateObj)
          .where('key', '=', obj.key)
          .execute()


      } catch (e) {
        console.error(e)
      }
    }
  }

  intervalId = setInterval(async () => {
    await this.reload()
  }, Number(process.env.FEEDGEN_CRON_INTERVAL || 10) * 60 * 1000) // 10m
}

function getIsDuplicate(arr1, arr2) {
  return [...arr1, ...arr2].filter(item => arr1.includes(item) && arr2.includes(item)).length > 0
}