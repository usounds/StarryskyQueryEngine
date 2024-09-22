import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { validateAuth } from '../auth'
import express from 'express'

// max 15 chars
export const shortname = 'starrysky'

export const handler = async (ctx: AppContext, params: QueryParams, rkey: string,req:express.Request) => {
  let recordNameHandler = await ctx.db
    .selectFrom('conditions')
    .selectAll()
    .where('recordName', '=', rkey)
    .execute()

  if( recordNameHandler.length==0){
    throw new InvalidRequestError('Unsupported algorithm:'+rkey)

  }

  const feed: { post: string }[] = [];
  let cursor: string | undefined

  const requesterDid = await validateAuth(
    req,
    ctx.cfg.serviceDid,
    ctx.didResolver)


  //プライベートフィード
  if(recordNameHandler[0].privateFeed!== null && recordNameHandler[0].privateFeed!== undefined && recordNameHandler[0].privateFeed!== '' ){
    const requesterDid = await validateAuth(
      req,
      ctx.cfg.serviceDid,
      ctx.didResolver)

      console.log(requesterDid)

      const allowDids = recordNameHandler[0].privateFeed.split(',')
      if(!allowDids.includes(requesterDid)){

        //空要素をそのまま返す
        return { cursor, feed }
      }
  }

  //ピン留め
  if(!params.cursor && recordNameHandler[0].pinnedPost!== null && recordNameHandler[0].pinnedPost!== undefined && recordNameHandler[0].pinnedPost!== '' ){
      const pinnedPostDids = recordNameHandler[0].pinnedPost.split(',')
      pinnedPostDids.forEach((row) => feed.push({
        post: row,
      }));
  }
  
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('key', '=', recordNameHandler[0].key)
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit)

  if (params.cursor) {
    const [indexedAt, cid] = params.cursor.split('::')
    if (!indexedAt || !cid) {
      throw new InvalidRequestError('malformed cursor')
    }
    const timeStr = new Date(parseInt(indexedAt, 10)).toISOString()
    builder = builder
      .where('post.indexedAt', '<', timeStr)
      .orWhere((qb) => qb.where('post.indexedAt', '=', timeStr))
      .where('post.cid', '<', cid)
  }
  const res = await builder.execute()

  res.forEach((row) => feed.push({
    post: row.uri,
  }));

  const last = res.at(-1)
  if (last) {
    cursor = `${new Date(last.indexedAt).getTime()}::${last.cid}`
  }

  return {
    cursor,
    feed,
  }
}
export default handler