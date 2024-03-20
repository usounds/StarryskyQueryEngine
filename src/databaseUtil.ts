import express from 'express'
import { AppContext } from './config'

const makeRouter =  (ctx: AppContext) => {
    const router = express.Router()

    //データ更新
    router.post('/setQuery', async (req: express.Request, res) => {
        console.log('Operation mode:updateQuery:'+req.body.key)
        const requestWebPasskey = req.headers['x-starrtsky-webpasskey']

        if(process.env.EDIT_WEB_PASSKEY !== undefined && requestWebPasskey !== process.env.EDIT_WEB_PASSKEY){
            res.sendStatus(401)
        }else{

            //登録時に正規表現をチェック
            try {
                new RegExp( req.body.inputRegex,'i') 
            } catch (err) {
                console.log('inputRegex error for:'+req.body.key)
                res.status(500).json({result:'INPUT_REGEX_ERROR',message:'inputRegexの正規表現が正しくありません。inputRegex error. Please input valid regex.'})
                return
            }

            try {
                new RegExp( req.body.invertRegex,'i')
            } catch (err) {
                console.log('invertRegex error for:'+req.body.key)
                res.status(500).json({result:'INVERT_REGEX_ERROR',message:'invertRegexの正規表現が正しくありません。invertRegex error. Please input valid regex.'})
                return
            }


            const recordNameRegex = new RegExp(/^[a-z0-9]{1,15}$/)
            
            if(!req.body.recordName.match(recordNameRegex)){
                console.log('recordNameRegex error for:'+req.body.recordNameRegex)
                res.status(500).json({result:'RECORDNAME_NOTALPHA',message:'RecordNameは半角英数の15文字以内の小文字です/RecordName shoud be 15 digit lowercase alphabets.'})
                return

            }

            if(isNaN(Number(req.body.refresh))){
                console.log('refresh error for:'+req.body.refresh)
                res.status(500).json({result:'NOT_NUMBER_REFRESH',message:'Refreshは数字のみです。/Refresh should be number.'})
                return

            }

            if(isNaN(Number(req.body.initPost))){
                console.log('initPost error for:'+req.body.initPost)
                res.status(500).json({result:'NOT_NUMBER_INITPOST',message:'初期取り込み件数は数字のみです。/Initial post count should be number.'})
                return

            }

            if(isNaN(Number(req.body.limitCount))){
                console.log('limitCount error for:'+req.body.limitCount)
                res.status(500).json({result:'NOT_NUMBER_LIMITCOUNT',message:'上限件数は数字のみです。/Limit post count should be number.'})
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
                lang:        req.body.lang,
                initPost:    req.body.initPost,
                imageOnly:   req.body.imageOnly,
                pinnedPost:  req.body.pinnedPost,
                limitCount:  req.body.limitCount,
                feedName:    req.body.feedName,
                feedAvatar:  req.body.feedAvatar,
                privateFeed: req.body.privateFeed,
                labelDisable:   req.body.labelDisable,
                replyDisable:   req.body.replyDisable,
                includeAltText: req.body.includeAltText,
                feedDescription:req.body.feedDescription,
                recordCount:0,
            }

            ctx.db
                .insertInto('conditions')
                .values(obj)
                .execute()

            console.log('Operation mode:updateQuery succeeded.')
            res.json({result:'OK',message:'更新に成功しました'})
        }
    })

    //データ取得
    router.post('/getQuery', async (req: express.Request, res) => {
        console.log('Operation mode:getQuery')
        const requestWebPasskey = req.headers['x-starrtsky-webpasskey']
        if(process.env.EDIT_WEB_PASSKEY !== undefined && requestWebPasskey !== process.env.EDIT_WEB_PASSKEY){
            res.sendStatus(401)
        }else{
            let conditionBuiler = ctx.db
                .selectFrom('conditions')
                .selectAll()
                .where('key', '=', req.body.key)
            const confitionRes = await conditionBuiler.execute()

            if(confitionRes.length===0){
                res.json({
                    result:'NOT_FOUND',
                    message:'Specified key not found. '+req.body.key
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
                    queryEngineVersion:'v0.1.2'
                }
            }
            res.json(returnObj)
        }
    })
    

  return router
}
export default makeRouter
