import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import dotenv from 'dotenv'
import { BskyAgent } from '@atproto/api'
import { QueryParams as QueryParamsSearch } from './lexicon/types/app/bsky/feed/searchPosts'
import { Database } from './db'
import {PostView } from './lexicon/types/app/bsky/feed/defs'

interface record {
  createdAt: string,
  text?:string,
  langs?:String[],
  reply:{},
  embed?:{
    images?:[{ 
        alt?:String
      }
    ]
  }
}

export class ScpecificActorsSubscription {
  agent:BskyAgent

  constructor(public db: Database) {
    this.agent = new BskyAgent({
      service: 'https://bsky.social'
    })

  }

  async run() {
    let query       = process.env.FEEDGEN_QUERY || '' 
    let inputRegex  = process.env.FEEDGEN_INPUT_REGEX || '' 
    let invertRegex = process.env.FEEDGEN_INVERT_REGEX || '' 
    let obj = {
      key:   'starrysky01',
      query: query,
      inputRegex: inputRegex,
      invertRegex: invertRegex,
      refresh:0
    }
    await this.db
      .insertInto('conditions')
      .values(obj)
      .onConflict(oc => oc.doNothing())
      .execute()

    await this.reload()
  }

  async reload() {
    dotenv.config()

    //ログイン
    if(!this.agent.hasSession){
      await this.agent.login({
        identifier: process.env.FEEDGEN_PUBLISHER_IDENTIFIER || '',
        password: process.env.FEEDGEN_APP_PASSWORD || ''
      })
    }

    //検索条件取得
    let conditionBuiler = this.db
      .selectFrom('conditions')
      .selectAll()
      .where('key', '=', 'starrysky01')
    const confitionRes = await conditionBuiler.execute()

    let query = ''
    let inputRegexText = ''
    let invertRegexText = ''

    for(let obj of confitionRes){
      query = obj.query
      inputRegexText = obj.inputRegex
      invertRegexText = obj.invertRegex || ''

      console.log(obj)

      if(obj.refresh===1){
        console.log('Refresh mode:')
        this.db
          .deleteFrom('post')
          .where('key', '=', 'starrysky01')
          .execute()

          
        let obj = {
            refresh: 0,
        }
        this.db
            .updateTable('conditions')
            .set(obj)
            .where('key', '=', 'starrysky01')
            .execute()
      }
    }
 
    console.log('query:'+query)
    console.log('inputRegex :'+inputRegexText)
    console.log('invertRegex:'+invertRegexText)

//    const query  = process.env.FEEDGEN_QUERY || ''            //Bluesky検索API向けクエリ
    const label  = process.env.FEEDGEN_LABEL_DISABLE || ''    //センシティブラベル付き投稿表示制御用フラグ
    const reply  = process.env.FEEDGEN_REPLY_DISABLE || ''    //リプライ表示抑制用フラグ
    const alt    = process.env.FEEDGEN_INCLUDE_ALTTEXT || ''  //画像のALT文字列検索可否フラグ
    const image  = process.env.FEEDGEN_IMAGE_ONLY || ''       //画像のみ抽出フラグ
    const lang   = process.env.FEEDGEN_LANG?.split(',')       //言語フィルタ用配列
    //const profiles = process.env.FEEDGEN_PROFILE_REGEX?.split(',')        //言語フィルタ用配列
    const inputRegex  = new RegExp( inputRegexText,'i')  //抽出正規表現
    const inviteRegex = new RegExp( invertRegexText,'i') //除外用正規表現
    const initCount = Number(process.env.FEEDGEN_INIT_POSTS || 1000)  //初期起動時の読み込み件数

    if(query==='')       console.log('FEEDGEN_QUERY is null.')
    if(process.env.FEEDGEN_INPUT_REGEX  ==='') console.log('FEEDGEN_INPUT_REGEX is null.')
    if(process.env.FEEDGEN_INVERT_REGEX ==='') console.log('FEEDGEN_INVERT_REGEX is null.')
    if(label==="")       console.log('FEEDGEN_LABEL is not set.')
    if(reply==="")       console.log('FEEDGEN_REPLY_DISABLE is not set.')
    if(alt==="")         console.log('FEEDGEN_INCLUDE_ALTTEXT is not set.')
    if(image==="")       console.log('FEEDGEN_IMAGE_ONLY is not set.')
    if(lang === undefined|| lang[0]=='')     console.log('FEEDGEN_LANG is null.')
    //if(profiles === undefined || profiles[0]=='')  console.log('FEEDGEN_PROFILE_REGEX is null.')

    //保存されている全投稿取得
    let builder = this.db
      .selectFrom('post')
      .selectAll()
      .orderBy('indexedAt', 'desc')
    const res = await builder.execute()
    const storedPost = res.map((subsc) => subsc.uri)
    let init = false
    let catchUp = false

    //件数ゼロなら初回起動モード
    if(res.length===0){
      init = true
      console.log('Initial job run.')
    //1件でも入っていれば差分起動モード
    }else{
      console.log('Delta job run. Current post count:'+res.length)
    }

    let recordcount = 0;
    let posts:PostView[] = []
    let cursor = 0
    let apiCall = 0
    const startTime = Date.now(); // 開始時間

    //初回起動モードは既定の件数まで処理を継続
    //差分起動モードは前回の実行に追いつくまで処理を継続
    //ただし、API検索が100回に到達する、または、APIの検索が終了した場合は処理を止める
    while (((!init && !catchUp) || (init && recordcount<initCount)) && cursor%100==0 && apiCall < 100) {
      //検索API実行
      const params_search:QueryParamsSearch = {
        q: query,
        limit: 100,
        cursor: String(cursor)
      }
      const seachResults = await this.agent.api.app.bsky.feed.searchPosts(params_search)
      apiCall++

      //念のため検索件数をログだし
      cursor = Number(seachResults.data.cursor)
      console.log('API cursor:'+cursor+'('+apiCall+'). Current post count:'+recordcount)

      for(let post of seachResults.data.posts){
        
        //前回実行分に追いついた
        if(storedPost.includes(post.uri)){
          console.log('Catch up finished. URI:'+post.uri)
          catchUp = true
          break
        }

        const record = post.record as record
        let text = record.text || ''

        // 検索APIがALT TEXTの検索ができないので削除
        if(alt === "true" && record.embed !== undefined && record.embed.images !== undefined){
          for(let image of record.embed.images){
            text = text + image.alt
          }
        }

        //INPUTにマッチしないものは除外
        if(!text.match(inputRegex)){
          continue
        }
        

        //Invertにマッチしたものは除外
        if(process.env.FEEDGEN_INVERT_REGEX !== undefined && process.env.FEEDGEN_INVERT_REGEX !== ''  && text.match(inviteRegex)){
          continue
        }

        //画像フィルタ
        if(image === 'true' && record.embed?.images === undefined ){
          continue
        }

        //言語フィルターが有効化されているか
        if(lang !== undefined && lang[0]!=="") {
          //投稿の言語が未設定の場合は除外
          if(record.langs===undefined) continue
          //言語が一致しない場合は除外
          if(!getIsDuplicate(record.langs,lang)) continue
        }

        //ラベルが有効な場合は、ラベルが何かついていたら除外
        if(label === "true" && post.labels?.length !== 0){
          continue
        }

        //リプライ無効の場合は、リプライを除外
        if(reply === "true" && record.reply!==undefined){
          continue
        }

        //プロファイルマッチが有効化されているか
        /*
        if(profiles !== undefined && profiles[0]!=="") {
          for(const profile of profiles){
            const [textTerm, profileRegexText] = profile.split('::')
            const profileRegex = new RegExp( profileRegexText || '','i')//除外用正規表現


            //指定された文字が投稿本文に含まれる場合は、Regex指定された文字列がプロフィールになければ除外
            if(text.indexOf(textTerm) !== -1 && !text.match(profileRegex)){
              console.log(text)
              console.log(textTerm)
              console.log(profileRegexText)
              continue
            }
          }
        }
        */

        //投稿をDBに保存
        recordcount++

        const postsToCreate = {
          uri: post.uri,
          key: 'starrysky01',
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
    console.log('Fetch job finished. Current job captured:' + recordcount+'. Time:'+ (endTime - startTime)+'ms')

  }

  intervalId = setInterval(async () => {
    await this.reload()
  }, Number(process.env.FEEDGEN_CRON_INTERVAL||10)*60*1000) // 10m
}

function getIsDuplicate(arr1, arr2) {
  return [...arr1, ...arr2].filter(item => arr1.includes(item) && arr2.includes(item)).length > 0
}