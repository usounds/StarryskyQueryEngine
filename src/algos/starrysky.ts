import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { validateAuth } from '../auth'
import express from 'express'
import { Conditions, checkRecord, getConditions, checkLabel } from '../util/conditionsCheck'
import { AtpAgent } from '@atproto/api'
import { QueryParams as QueryParamsSearch } from '../lexicon/types/app/bsky/feed/searchPosts'


import { record} from '../subscription'

// max 15 chars
export const shortname = 'starrysky'

export const handler = async (ctx: AppContext, params: QueryParams, rkey: string, req: express.Request, agent: AtpAgent) => {

  let conditions = await getConditions(ctx.db)
  conditions = conditions.filter(condition => condition.recordName === rkey);

  if (conditions.length === 0) {
    throw new InvalidRequestError('Unsupported algorithm:' + rkey)

  }

  let condition = conditions[0]

  const feed: { post: string }[] = [];
  let cursor: string | undefined


  //プライベートフィード
  if (condition.privateFeed !== null && condition.privateFeed !== undefined && condition.privateFeed !== '') {

    const requesterDid = await validateAuth(
      req,
      ctx.cfg.serviceDid,
      ctx.didResolver)

    console.log(requesterDid)

    const allowDids = condition.privateFeed.split(',')
    if (!allowDids.includes(requesterDid)) {

      //空要素をそのまま返す
      return { cursor, feed }
    }
  }

  //ピン留め
  if (!params.cursor && condition.pinnedPost !== null && condition.pinnedPost !== undefined && condition.pinnedPost !== '') {
    const pinnedPostDids = condition.pinnedPost.split(',')
    pinnedPostDids.forEach((row) => feed.push({
      post: row,
    }));
  }

  if (condition.inputType === 'query') {

    let builder = ctx.db
      .selectFrom('post')
      .selectAll()
      .where('key', '=', condition.key)
      .orderBy('indexedAt', 'desc')
      .orderBy('cid', 'desc')
      .limit(params.limit)

    if (params.cursor) {
      const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
      builder = builder.where('post.indexedAt', '<', timeStr)
    }
    const res = await builder.execute()

    res.forEach((row) => feed.push({
      post: row.uri,
    }));

    const last = res.at(-1)
    if (last) {
      cursor = new Date(last.indexedAt).getTime().toString(10)
    }
  } else if (condition.inputType === 'basic') {

    let searchQuery = condition.query
    if (condition.lang) {
      searchQuery = searchQuery + ' lang:' + condition.lang
    }

    let currentCursor = 0

    do {
      if(!cursor){
        cursor = params.cursor || '0'
      }
      const params_search: QueryParamsSearch = {
        q: searchQuery,
        limit: 100,
        cursor: cursor
      }
      console.log(params_search)
      const seachResults = await agent.app.bsky.feed.searchPosts(params_search)

      for(let obj of seachResults.data.posts){
        currentCursor ++ 

        const record = obj.record as record
        let check = checkRecord(condition,record,obj.author.did, new Map<string, string>)
        if (!check) {
          continue
        }

        const check2 = await checkLabel(condition, obj)
        if (!check2) {
          continue
        }

        feed.push({
          post: obj.uri,
        })

        if (feed.length >=params.limit) {
          break
        }

      }

      if (feed.length >=params.limit) {
        break
      }

      cursor = seachResults.data.cursor
      
    } while (1) 
      cursor =(currentCursor + Number(cursor||'0')).toString()
  }

  return {
    cursor,
    feed,
  }
}
export default handler