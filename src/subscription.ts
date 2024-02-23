import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import dotenv from 'dotenv'
import { BskyAgent } from '@atproto/api'
import { QueryParams as QueryParamsSearch } from './lexicon/types/app/bsky/feed/searchPosts'
import { Database } from './db'
import { ConnectionBuilder } from 'kysely'
import {PostView } from './lexicon/types/app/bsky/feed/defs'

interface record {
  createdAt: string,
  text?:string,
  langs?:String[],
  reply:{}
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

    //セッション永続
    if(!this.agent.hasSession){
      await this.agent.login({
        identifier: process.env.FEEDGEN_PUBLISHER_IDENTIFIER || '',
        password: process.env.FEEDGEN_APP_PASSWORD || ''
      })
    }

    const query =  process.env.FEEDGEN_QUERY || ''
    let inputRegex  = process.env.FEEDGEN_INPUT_REGEX || ''
    let inviteRegex = process.env.FEEDGEN_INVERT_REGEX || ''
    const label = process.env.FEEDGEN_LABEL_DISABLE || ''
    const reply = process.env.FEEDGEN_REPLY_DISABLE || ''
    const lang  = process.env.FEEDGEN_LANG?.split(',')
    const deepDive = Number(process.env.FEEDGEN_DEEP_DIVE||1)

    inputRegex = inputRegex.toLowerCase()
    inviteRegex = inviteRegex.toLowerCase()

    if(query==='')       console.log('FEEDGEN_QUERY is null.')
    if(inputRegex==='')  console.log('FEEDGEN_INPUT_REGEX is null.')
    if(inviteRegex==='') console.log('FEEDGEN_INVERT_REGEX is null.')
    if(label==="")       console.log('FEEDGEN_LABEL is not set.')
    if(reply==="")       console.log('FEEDGEN_REPLY_DISABLE is not set.')
    if(deepDive === 1)   console.log('FEEDGEN_DEEP_DIVE is default value 1.')
    if(lang === undefined || lang[0]=='')  console.log('FEEDGEN_LANG is null.')

    let posts:PostView[] = []

    let cursor = 0

    for (let i:number = 0; i < deepDive && cursor%100==0; i++) {
      const params_search:QueryParamsSearch = {
        q: query,
        limit: 100,
        cursor: String(cursor)
      }
      const seachResults = await this.agent.api.app.bsky.feed.searchPosts(params_search)

      posts.push(...seachResults.data.posts)
      cursor = Number(seachResults.data.cursor)
   }
  
    let recordcount = 0;

    for(let post of posts){
      const record = post.record as record
      //INPUTにマッチしないものは除外
      if(!record.text?.toLowerCase().match(inputRegex)){
        continue;
      }

      //Invertにマッチしたものは除外
      if(record.text?.toLowerCase().match(inviteRegex)){
        continue;
      }

      //言語フィルターが有効化されているか
      if(lang !== undefined && lang[0]!=="") {
        //投稿の言語が未設定の場合は除外
        if(record.langs===undefined) continue;
        //言語が一致しない場合は除外
        if(!getIsDuplicate(record.langs,lang)) continue;
      }
        //&& record.langs!== undefined &&  !getIsDuplicate(record.langs,lang)){
       // continue;

      //ラベルが有効な場合は、ラベルが何かついていたら除外
      if(label === "true" && post.labels?.length !== 0){
        continue;
      }

      //リプライ無効の場合は、リプライを除外
      if(reply === "true" && record.reply!==undefined){
        continue;
      }

      console.log(record.text)
      rowcount++

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

    console.log('count:' + rowcount)
  }

  intervalId = setInterval(async () => {
    await this.reload()
  }, Number(process.env.FEEDGEN_CRON_INTERVAL||10)*60*1000) // 10m
}

function getIsDuplicate(arr1, arr2) {
  return [...arr1, ...arr2].filter(item => arr1.includes(item) && arr2.includes(item)).length > 0
}