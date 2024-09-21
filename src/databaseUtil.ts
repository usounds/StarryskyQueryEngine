import express from 'express'
import { AppContext } from './config'
import { appVersion } from "./subscription"
import {WebSocketReceiver} from './jerstream'

const makeRouter = (ctx: AppContext, jetsrteam:WebSocketReceiver) => {
    const router = express.Router()

    //データ更新
    router.post('/setQuery', async (req: express.Request, res) => {
        console.log('Operation mode:updateQuery:' + req.body.key)
        const requestWebPasskey = req.headers['x-starrtsky-webpasskey']

        if (process.env.EDIT_WEB_PASSKEY !== undefined && requestWebPasskey !== process.env.EDIT_WEB_PASSKEY) {
            res.sendStatus(401)
        } else {

            //登録時に正規表現をチェック
            try {
                new RegExp(req.body.inputRegex, 'i')
            } catch (err) {
                console.log('inputRegex error for:' + req.body.key)
                res.status(500).json({ result: 'INPUT_REGEX_ERROR', message: 'inputRegexの正規表現が正しくありません。inputRegex error. Please input valid regex.' })
                return
            }

            try {
                new RegExp(req.body.invertRegex, 'i')
            } catch (err) {
                console.log('invertRegex error for:' + req.body.key)
                res.status(500).json({ result: 'INVERT_REGEX_ERROR', message: 'invertRegexの正規表現が正しくありません。invertRegex error. Please input valid regex.' })
                return
            }

            const recordNameRegex = new RegExp(/^[a-z0-9-]{1,15}$/)

            if (!req.body.recordName.match(recordNameRegex)) {
                console.log('recordNameRegex error for:' + req.body.recordNameRegex)
                res.status(500).json({ result: 'RECORDNAME_NOTALPHA', message: 'RecordNameは半角英数の15文字以内の小文字です/RecordName shoud be 15 digit lowercase alphabets.' })
                return

            }

            if (!/^-?\d+$/.test(req.body.refresh)) {
                console.log('refresh error for:' + req.body.refresh);
                res.status(500).json({ result: 'NOT_NUMBER_REFRESH', message: 'Refreshは整数のみです。/Refresh should be an integer.' });
                return;
            }

            if (isNaN(Number(req.body.initPost))) {
                console.log('initPost error for:' + req.body.initPost)
                res.status(500).json({ result: 'NOT_NUMBER_INITPOST', message: '初期取り込み件数は数字のみです。/Initial post count should be number.' })
                return

            }

            if (isNaN(Number(req.body.limitCount))) {
                console.log('limitCount error for:' + req.body.limitCount)
                res.status(500).json({ result: 'NOT_NUMBER_LIMITCOUNT', message: '上限件数は数字のみです。/Limit post count should be number.' })
                return

            }

            if (req.body.profileMatch) {

                const [textTerm, profileRegexText] = req.body.profileMatch.split('::')

                try {
                    new RegExp(textTerm, 'i')
                    new RegExp(profileRegexText, 'i')
                } catch (err) {
                    console.log('profileMatch error for:' + req.body.key)
                    res.status(500).json({ result: 'PROFILE_MATCH_REGEX_ERROR', message: 'profileMatchの正規表現が正しくありません。/profileMatch error. Please input valid regex.' })
                    return
                }
            }

            ctx.db
                .deleteFrom('conditions')
                .where('key', '=', req.body.key)
                .execute()

            let obj = {
                key: req.body.key,
                recordName: req.body.recordName,
                query: req.body.query,
                refresh: req.body.refresh,
                inputRegex: req.body.inputRegex,
                invertRegex: req.body.invertRegex,
                lang: req.body.lang,
                initPost: req.body.initPost,
                imageOnly: req.body.imageOnly,
                pinnedPost: req.body.pinnedPost,
                limitCount: req.body.limitCount,
                feedName: req.body.feedName,
                feedAvatar: req.body.feedAvatar,
                privateFeed: req.body.privateFeed,
                labelDisable: req.body.labelDisable,
                replyDisable: req.body.replyDisable,
                includeAltText: req.body.includeAltText,
                feedDescription: req.body.feedDescription,
                recordCount: 0,
                profileMatch: req.body.profileMatch,
                customLabelerDid: req.body.customLabelerDid,
                customLabelerLabelValues: req.body.customLabelerLabelValues,
                embedExternalUrl:req.body.embedExternalUrl,
                inputType: req.body.inputType,
                invetListUri:req.body.invetListUri,
            }

            ctx.db
                .insertInto('conditions')
                .values(obj)
                .execute()

            console.log('Operation mode:updateQuery succeeded.')

            //console.log(jetsrteam)
            //jetsrteam.setupConnection()
            res.json({ result: 'OK', message: '更新に成功しました' })

        }
    })

    //データ取得
    router.post('/getQuery', async (req: express.Request, res) => {
        console.log('Operation mode:getQuery')
        const requestWebPasskey = req.headers['x-starrtsky-webpasskey']
        if (process.env.EDIT_WEB_PASSKEY !== undefined && requestWebPasskey !== process.env.EDIT_WEB_PASSKEY) {
            res.sendStatus(401)
        } else {
            let conditionBuiler = ctx.db
                .selectFrom('conditions')
                .selectAll()
                .where('key', '=', req.body.key)
            const confitionRes = await conditionBuiler.execute()

            if (confitionRes.length === 0) {
                res.json({
                    result: 'NOT_FOUND',
                    message: 'Specified key not found. ' + req.body.key,
                    queryEngineVersion: appVersion()
                })
                return
            }

            let time_us = jetsrteam.currentTimeUs()

            let returnObj
            for (let obj of confitionRes) {
                returnObj = {
                    result: "OK",
                    key: obj.key,
                    recordName: obj.recordName,
                    query: obj.query,
                    inputRegex: obj.inputRegex,
                    invertRegex: obj.invertRegex,
                    refresh: obj.refresh,
                    lang: obj.lang,
                    labelDisable: obj.labelDisable,
                    replyDisable: obj.replyDisable,
                    imageOnly: obj.imageOnly,
                    includeAltText: obj.includeAltText,
                    initPost: obj.initPost,
                    pinnedPost: obj.pinnedPost,
                    lastExecTime: obj.lastExecTime,
                    feedAvatar: obj.feedAvatar,
                    feedName: obj.feedName,
                    feedDescription: obj.feedDescription,
                    privateFeed: obj.privateFeed,
                    limitCount: obj.limitCount,
                    recordCount: obj.recordCount,
                    profileMatch: obj.profileMatch,
                    customLabelerDid: obj.customLabelerDid,
                    customLabelerLabelValues: obj.customLabelerLabelValues,
                    embedExternalUrl:obj.embedExternalUrl,
                    inputType: obj.inputType,
                    invetListUri:obj.invetListUri,
                    queryEngineVersion: appVersion(),
                    timeUs:time_us
                }
            }
            res.json(returnObj)
        }
    })

    //フィード削除
    router.post('/deleteCondition', async (req: express.Request, res) => {
        console.log('Operation mode:deleteCondition:' + req.body.key)
        const requestWebPasskey = req.headers['x-starrtsky-webpasskey']

        if (process.env.EDIT_WEB_PASSKEY !== undefined && requestWebPasskey !== process.env.EDIT_WEB_PASSKEY) {
            res.sendStatus(401)
        } else {
            ctx.db
                .deleteFrom('conditions')
                .where('key', '=', req.body.key)
                .execute()

            ctx.db
                .deleteFrom('post')
                .where('key', '=', req.body.key)
                .execute()
        }

        const returnObj = {
            result: "OK",
        }
        res.json(returnObj)
    })

    return router
}
export default makeRouter
