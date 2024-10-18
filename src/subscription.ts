import dotenv from 'dotenv'
import { AtpAgent } from '@atproto/api'
import { QueryParams as QueryParamsSearch } from './lexicon/types/app/bsky/feed/searchPosts'
import { Database } from './db'
import * as pkg from "../package.json"
import { PostView } from '@atproto/api/dist/client/types/app/bsky/feed/defs';

import { Conditions,checkRecord,getConditions,checkLabel } from './util/conditionsCheck'
import { sessionCheck } from './util/atpAgentWrapper'

let conditions: Conditions[]

export function appVersion(): string {
  return pkg.version;
}

export type record = {
  createdAt: string
  text?: string
  langs?: string[]
  reply: {}
  embed?: {
    images?: imageObject[]
    external?: {
      uri?: string
    }
    $type? : string
  },
  labels:{
  }
}

export type imageObject = {
  alt: string
  aspectRatio: {
    height: number
    width: number
  }
  fullsize: string
  thumb: string
}

export class ScpecificActorsSubscription {

  private isReloading: boolean = false;

  constructor(public db: Database, public agent:AtpAgent) {
  }

  async run() {

    await this.reload()
  }

  async reload() {
    dotenv.config()

    if (this.isReloading) {
      console.log('処理中のため、次の実行をスキップします。');
      return; // 前の処理が終わっていないのでスキップ
    }

    this.isReloading = true

    //検索条件取得
    conditions = await getConditions(this.db)

    if (conditions.length === 0) console.log('Query Engineには検索条件は登録されていません。Admin Consoleから登録してください。There is no conditions.')

    for (let obj of conditions) {

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
          .where('inputType', '=', 'query')
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
        const lang = obj.lang //言語フィルタ用配列
        const initCount = obj.initPost || 100  //初期起動時の読み込み件数
        const profileMatch = obj.profileMatch || ''  //プロフィールマッチ
        const customLabelerDid = obj.customLabelerDid //カスタムラベラー
        const customLabelerLabelValues = obj.customLabelerLabelValues //カスタムラベラーのラベル値
        const label = obj.labelDisable //カスタムラベラーのラベル値

        let recordcount = 0;
        let posts: PostView[] = []
        let cursor = 0
        let apiCall = 0
        const startTime = Date.now(); // 開始時間

        //言語フィルタ
        let searchQuery = query
        if (lang) {
          searchQuery = searchQuery + ' lang:' + lang
        }

        //公式ラベラーをデフォルトセット
        let labelerDid: string[] = ['did:plc:ar7c4by46qjdydhdevvrndac']

        //カスタムラベラーが入力されていたらセット
        if (customLabelerDid) {
          labelerDid.push(customLabelerDid)

        }

        this.agent.configureLabelers(labelerDid)

        // jetstreamで2回目以降は処理をスキップ
        if(obj.inputType==='jetstream' && !init ) continue

        //basicは処理をスキップ
        if(obj.inputType==='basic') continue
        
        await sessionCheck(this.agent)

        //初回起動モードは既定の件数まで処理を継続
        //差分起動モードは前回の実行に追いつくまで処理を継続
        //ただし、API検索が100回に到達する、または、APIの検索が終了した場合は処理を止める
        while (obj.inputType==='query' && ((!init && !catchUp) || (init && recordcount < initCount)) && cursor % 100 == 0 && apiCall < 100) {
          //検索API実行
          const params_search: QueryParamsSearch = {
            q: searchQuery,
            limit: 100,
            cursor: String(cursor)
          }
          const seachResults = await this.agent.app.bsky.feed.searchPosts(params_search)
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
            if (storedPost.includes(post.uri) && !init) {
              console.log('Catch up finished. URI:' + post.uri)
              catchUp = true
              break
            }


            const record = post.record as record

            const check = await checkRecord(obj, record, post.author.did, userProfileStringsMap)
            if (!check) {
              continue
            }

/*
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

            //埋め込みURL
            if (embedExternalUrl === 'true' && record.embed?.external?.uri) {
              text = text + '\n' + record.embed?.external?.uri
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
*/
            const checkLabelResult = await checkLabel(obj, post)
            if (!checkLabelResult) {
              continue
            }

            /*
            //ラベルの仕分け
            let officialLabels: string[] = []
            let customLabels: string[] = []

            if (post.labels) {
              // seachResults.data.posts[0].labels配列の各要素に対して処理を行う
              post.labels.map((label: any) => {
                // 後付けラベル
                if (label.ver) {
                  // 公式ラベラー
                  if (label.src === 'did:plc:ar7c4by46qjdydhdevvrndac') {
                    officialLabels.push(label.val)
                  } else {
                    // カスタムラベラー
                    customLabels.push(label.val)
                  }
                } else {
                  // セルフラベル
                  officialLabels.push(label.val + '(self)');
                }
              })
            }

            //公式ラベルが有効な場合は、ラベルが何かついていたら除外
            if (label === "true" && officialLabels.length !== 0) {
              continue
            }

            //カスタムラベラーのラベルに値があれば比較する
            let skip = false
            if (customLabelerLabelValues) {
              const labels: string[] = customLabelerLabelValues.split(',')
              if (getIsDuplicate(labels, customLabels)) {
                skip = true
                continue
              }
            }

            if (skip) continue
            */


            /*

            //リプライ無効の場合は、リプライを除外
            if (reply === "true" && record.reply !== undefined) {
              continue
            }

            //プロファイルマッチが有効化されており、かつ、検索ワードの1つにしか合致していない
            skip = false
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


    */

            //投稿をDBに保存
            recordcount++

            const postsToCreate = {
              uri: post.uri,
              key: obj.key,
              cid: post.cid,
              // indexedAt: new Date().toISOString(),
              indexedAt: record.createdAt,
              inputType: 'query'
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

        const res3 = await this.db
          .selectFrom('post')
          .selectAll()
          .where('key', '=', obj.key)
          .orderBy('indexedAt', 'desc')
          .execute()

        console.log('count : '+res3.length)

        if (res3.length > obj.limitCount) {
          const deletePost = res3.length - obj.limitCount

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
    this.isReloading = false

  }

  intervalId = setInterval(async () => {
    await this.reload()
  }, Number(process.env.FEEDGEN_CRON_INTERVAL || 10) * 60 * 1000) // 10m
}

export function getIsDuplicate(arr1, arr2) {
  return [...arr1, ...arr2].filter(item => arr1.includes(item) && arr2.includes(item)).length > 0
}