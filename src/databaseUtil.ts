import express from 'express'
import { AppContext } from './config'

const makeRouter =  (ctx: AppContext) => {
    const router = express.Router()

    //データ更新
    router.post('/setQuery', async (req: express.Request, res) => {
        if(process.env.EDIT_WEB_PASSKEY !== undefined && req.body.authkey !== process.env.EDIT_WEB_PASSKEY){
            res.sendStatus(401)
        }else{
            console.log('Operation mode:updateQuery')

            //登録時に正規表現をチェック
            try {
                new RegExp( req.body.inputRegex,'i') 
            } catch (err) {
                console.log('inputRegex error for:'+req.body.key)
                res.json({result:'INPUT_REGEX_ERROR',message:'inputRegexの正規表現が正しくありません。inputRegex error. Please input valid regex.'})
                return
            }

            try {
                new RegExp( req.body.invertRegex,'i')
            } catch (err) {
                console.log('invertRegex error for:'+req.body.key)
                res.json({result:'INVERT_REGEX_ERROR',message:'invertRegexの正規表現が正しくありません。invertRegex error. Please input valid regex.'})
                return
            }
            ctx.db
                .deleteFrom('conditions')
                .where('key', '=', req.body.key)
                .execute()

            let obj = {
                key:req.body.key,
                recordName:req.body.recordName,
                query:       req.body.query,
                refresh:     req.body.refresh,
                inputRegex:  req.body.inputRegex,
                invertRegex: req.body.invertRegex,
                lang: req.body.lang,
                labelDisable: req.body.labelDisable,
                replyDisable: req.body.replyDisable,
                imageOnly: req.body.imageOnly,
                includeAltText: req.body.includeAltText,
                initPost: req.body.initPost,
                pinnedPost: req.body.pinnedPost,
                limitCount:req.body.limitCount,
                privateFeed:req.body.privateFeed,
                feedName:req.body.feedName,
                feedDescription:req.body.feedDescription,
                feedAvatar:req.body.feedAvatar,
                recordCount:0,
            }

            ctx.db
                .insertInto('conditions')
                .values(obj)
                .execute()

            console.log('Operation mode:updateQuery succeeded.')
            res.json({result:'OK'})
        }
    })

    //データ取得
    router.post('/getQuery', async (req: express.Request, res) => {
        if(process.env.EDIT_WEB_PASSKEY !== undefined && req.body.authkey !== process.env.EDIT_WEB_PASSKEY){
            res.sendStatus(401)
        }else{
            console.log('Operation mode:getQuery')
            let conditionBuiler = ctx.db
                .selectFrom('conditions')
                .selectAll()
                .where('key', '=', req.body.key)
            const confitionRes = await conditionBuiler.execute()

            let isMemoryMode = false
            if(!process.env.FEEDGEN_SQLITE_LOCATION || process.env.FEEDGEN_SQLITE_LOCATION ===':memory:'){
                isMemoryMode = true
            }

            if(confitionRes.length===0){
                res.json({
                    result:'NOT_FOUND',
                    message:'Specified key not found. '+req.body.key,
                    isMemoryMode:isMemoryMode
                })
                return
            }

            let returnObj
            for(let obj of confitionRes){
                returnObj = {
                    result:"OK",
                    key:obj.key,
                    recordName:obj.recordName,
                    query:obj.query,
                    inputRegex:obj.inputRegex,
                    invertRegex:obj.invertRegex,
                    refresh:obj.refresh,
                    lang:obj.lang,
                    labelDisable:obj.labelDisable,
                    replyDisable:obj.replyDisable,
                    imageOnly:obj.imageOnly,
                    includeAltText:obj.includeAltText,
                    initPost:obj.initPost,
                    pinnedPost:obj.pinnedPost,
                    lastExecTime:obj.lastExecTime,
                    feedAvatar:obj.feedAvatar,
                    feedName:obj.feedName,
                    feedDescription:obj.feedDescription,
                    privateFeed:obj.privateFeed,
                    limitCount:obj.limitCount,
                    recordCount:obj.recordCount,
                    isMemoryMode:isMemoryMode
                }
            }
            res.json(returnObj)
        }
    })
    

  return router
}
export default makeRouter
