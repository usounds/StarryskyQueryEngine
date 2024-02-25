import express from 'express'
import { AppContext } from './config'

const makeRouter =  (ctx: AppContext) => {
    const router = express.Router()

    //データ更新
    router.post('/setQuery', (req: express.Request, res) => {
        if(req.body.authkey !== process.env.EDIT_WEB_PASSKEY){
            res.sendStatus(401)
        }else{
            console.log('Operation mode:updateQuery')
            let obj = {
                query:       req.body.query,
                refresh:     req.body.refresh,
                inputRegex:  req.body.inputRegex,
                invertRegex: req.body.invertRegex,
            }
            ctx.db
                .updateTable('conditions')
                .set(obj)
                .where('key', '=', 'starrysky01')
                .execute()

            res.json({res:'OK'})
        }
    })

    //データ取得
    router.post('/getQuery', async (req: express.Request, res) => {
        if(req.body.authkey !== process.env.EDIT_WEB_PASSKEY){
            res.sendStatus(401)
        }else{
            console.log('Operation mode:getQuery')
            let conditionBuiler = ctx.db
                .selectFrom('conditions')
                .selectAll()
                .where('key', '=', 'starrysky01')
            const confitionRes = await conditionBuiler.execute()
            let returnObj
            for(let obj of confitionRes){
                returnObj = {
                    result:"OK",
                    key:obj.key,
                    query:obj.query,
                    inputRegex:obj.inputRegex,
                    invertRegex:obj.invertRegex,
                    refresh:obj.refresh,
                }
            }
            res.json(returnObj)
        }
    })
    

  return router
}
export default makeRouter
