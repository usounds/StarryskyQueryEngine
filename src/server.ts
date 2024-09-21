import http from 'http'
import events from 'events'
import express from 'express'
import { DidResolver, MemoryCache } from '@atproto/identity'
import { createServer } from './lexicon'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import { createDb, Database, migrateToLatest } from './db'
import { ScpecificActorsSubscription } from './subscription'
import { AppContext, Config } from './config'
import wellKnown from './well-known'
import databaseUtil from './databaseUtil'
import {WebSocketReceiver} from './jerstream'
import fetch from 'node-fetch'
import * as pkg from "../package.json"

export function appVersion(): string {
  return pkg.version;
}


export class FeedGenerator {
  public app: express.Application
  public server?: http.Server
  public db: Database
  public actorsfeed: ScpecificActorsSubscription
  public cfg: Config

  constructor(
    app: express.Application,
    db: Database,
    actorsfeed: ScpecificActorsSubscription,
    cfg: Config,
  ) {
    this.app = app
    this.db = db
    this.actorsfeed = actorsfeed
    this.cfg = cfg
  }

  static async create(cfg: Config): Promise<FeedGenerator> {
    const app = express()
    const db = await createDb(cfg.sqliteLocation)
    await migrateToLatest(db);  // データベースのマイグレーションを実行

    //Admin Console経由でD1に保存された検索条件を取得
    const adminConsoleEndpoint = process.env.STARRYSKY_ADMIN_CONSOLE || 'https://starrysky-console.pages.dev'
    let serverUrl
    if (process.env.FEEDGEN_HOSTNAME === 'example.com') {
      serverUrl = 'http://localhost:' + process.env.FEEDGEN_PORT
    } else {
      serverUrl = 'https://' + process.env.FEEDGEN_HOSTNAME
    }

    console.log('Starrysky Query Engine:' + appVersion())
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
              customLabelerDid: record.customLabelerDid,
              customLabelerLabelValues: record.customLabelerLabelValues,
              recordCount: 0
            }

            await db
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

    // const firehose = new FirehoseSubscription(db, cfg.subscriptionEndpoint)
    const actorsfeed = new ScpecificActorsSubscription(db)

    const didCache = new MemoryCache()
    const didResolver = new DidResolver({
      plcUrl: 'https://plc.directory',
      didCache,
    })

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024, // 5mb
      },
    })
    const ctx: AppContext = {
      db,
      didResolver,
      cfg,
    }

    if(cfg.jetstreamEndpoint){
        const jetstream = new WebSocketReceiver(cfg.jetstreamEndpoint,db)
    }

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    feedGeneration(server, ctx)
    describeGenerator(server, ctx)
    app.use(server.xrpc.router)
    app.use(wellKnown(ctx))
    app.use(databaseUtil(ctx))

    return new FeedGenerator(app, db, actorsfeed, cfg)
  }

  async start(): Promise<http.Server> {
    await migrateToLatest(this.db)
    this.actorsfeed.run()
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')
    return this.server
  }
}

export default FeedGenerator
