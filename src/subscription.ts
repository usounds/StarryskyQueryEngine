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

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    // This logs the text of every post off the firehose.
    // Just for fun :)
    // Delete before actually using
    for (const post of ops.posts.creates) {
      console.log(post.record.text)
    }

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        // only alf-related posts
        return create.record.text.toLowerCase().includes('alf')
      })
      .map((create) => {
        // map alf-related posts to a db row
        return {
          uri: create.uri,
          cid: create.cid,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
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
    await this.reload()
  }

  async reload() {
    let rowcount = 0;

    // Bearer取得
    dotenv.config()

    //ログイン
    if(!this.agent.hasSession){
      await this.agent.login({
        identifier: process.env.FEEDGEN_PUBLISHER_IDENTIFIER || '',
        password: process.env.FEEDGEN_APP_PASSWORD || ''
      })
    }

    const query =  process.env.FEEDGEN_QUERY || ''
    const inputRegex  = new RegExp( process.env.FEEDGEN_INPUT_REGEX || '','i')
    const inviteRegex = new RegExp( process.env.FEEDGEN_INVERT_REGEX || '','i')
    const label = process.env.FEEDGEN_LABEL_DISABLE || ''
    const reply = process.env.FEEDGEN_REPLY_DISABLE || ''
    //const alt   = process.env.FEEDGEN_INCLUDE_ALTTEXT || ''
    const image = process.env.FEEDGEN_IMAGE_ONLY || ''
    const initCount = Number(process.env.FEEDGEN_INIT_POSTS || 1000)
    const lang  = process.env.FEEDGEN_LANG?.split(',')

    if(query==='')       console.log('FEEDGEN_QUERY is null.')
    if(process.env.FEEDGEN_INPUT_REGEX  ==='') console.log('FEEDGEN_INPUT_REGEX is null.')
    if(process.env.FEEDGEN_INVERT_REGEX ==='') console.log('FEEDGEN_INVERT_REGEX is null.')
    if(label==="")       console.log('FEEDGEN_LABEL is not set.')
    if(reply==="")       console.log('FEEDGEN_REPLY_DISABLE is not set.')
    //if(alt==="")         console.log('FEEDGEN_INCLUDE_ALTTEXT is not set.')
    if(image==="")       console.log('FEEDGEN_IMAGE_ONLY is not set.')
    if(lang === undefined || lang[0]=='')  console.log('FEEDGEN_LANG is null.')

    let builder = this.db
      .selectFrom('post')
      .selectAll()
      .orderBy('indexedAt', 'desc')
    const res = await builder.execute()
    const storedPost = res.map((subsc) => subsc.uri)
    let init = false
    let catchUp = false

    if(res.length===0){
      init = true
      console.log('Initial job run.')
    }else{
      console.log('Delta job run. Current post count:'+res.length)
    }
    let recordcount = 0;

    let posts:PostView[] = []
    let cursor = 0
    while (((!init && !catchUp) || (init && recordcount<initCount)) && cursor%100==0) {
      const params_search:QueryParamsSearch = {
        q: query,
        limit: 100,
        cursor: String(cursor)
      }
      const seachResults = await this.agent.api.app.bsky.feed.searchPosts(params_search)

 //     posts.push(...seachResults.data.posts)
      cursor = Number(seachResults.data.cursor)
      console.log('API cursor:'+cursor)
      console.log('Cuptured:'+recordcount)

      for(let post of seachResults.data.posts){
        
        //前回実行分に追いついた
        if(storedPost.includes(post.uri)){
          console.log('Catch up finished. URI:'+post.uri)
          catchUp = true
          break
        }

        const record = post.record as record
        let text = record.text || ''

      /* 検索APIがALT TEXTの検索ができないので削除
      if(alt === "true" && record.embed !== undefined && record.embed.images !== undefined){
        for(let image of record.embed.images){
          text = text + image.alt
        }
      }
      */

        //INPUTにマッチしないものは除外
        if(!text.match(inputRegex)){
          continue
        }

        //Invertにマッチしたものは除外
        if(process.env.FEEDGEN_INVERT_REGEX !== undefined && text.match(inviteRegex)){
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

        recordcount++

        const postsToCreate = {
          uri: post.uri,
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

    console.log('Fetch job finished. Current job captured:' + recordcount)
  }

  intervalId = setInterval(async () => {
    await this.reload()
  }, Number(process.env.FEEDGEN_CRON_INTERVAL||10)*60*1000) // 10m
}

function getIsDuplicate(arr1, arr2) {
  return [...arr1, ...arr2].filter(item => arr1.includes(item) && arr2.includes(item)).length > 0
}