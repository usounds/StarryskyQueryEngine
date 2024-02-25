import { Server } from '../lexicon'
import { AppContext } from '../config'
import { AtUri } from '@atproto/syntax'

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.describeFeedGenerator(async () => {
    let builder = ctx.db
      .selectFrom('conditions')
      .selectAll()
    const res = await builder.execute()
    
    const feeds =res.map((obj) => ({
      uri: AtUri.make(
        ctx.cfg.publisherDid,
        'app.bsky.feed.generator',
        obj.recordName,
      ).toString(),
    }))
    return {
      encoding: 'application/json',
      body: {
        did: ctx.cfg.serviceDid,
        feeds,
      },
    }
  })
}
