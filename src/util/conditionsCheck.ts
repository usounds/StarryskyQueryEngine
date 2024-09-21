

import { record, imageObject, getIsDuplicate } from '../subscription'
import { AtpAgent } from '@atproto/api'
import { Database } from '../db'

export interface Conditions {
    key: string;
    recordName: string;
    query: string;
    inputRegex: string;
    invertRegex: string;
    refresh: number;
    lang: string;
    labelDisable: string;
    replyDisable: string;
    imageOnly: string;
    initPost: number;
    pinnedPost: string;
    feedName: string;
    feedDescription: string;
    limitCount: number;
    privateFeed: string;
    includeAltText: string;
    profileMatch: string;
    customLabelerDid: string;
    customLabelerLabelValues: string;
    embedExternalUrl: string;
    enableExactMatch: string;
    inputType: string;
    listUri: string;
    invetListUri: string;
}


export async function getConditions(db: Database): Promise<Conditions[]> {
    //console.log('getConditions')
    // Condition tableからオブジェクトを変換
    let conditionBuiler = db
        .selectFrom('conditions')
        .selectAll()
    const confitionRes = await conditionBuiler.execute()

    const conditions = confitionRes.map((row: any) => ({
        key: row.key || '',
        recordName: row.recordName || '',
        query: row.query || '',
        inputRegex: row.inputRegex || '',
        invertRegex: row.invertRegex || '',
        refresh: row.refresh || 0,
        lang: row.lang || '',
        labelDisable: row.labelDisable || '',
        replyDisable: row.replyDisable || 'false',
        imageOnly: row.imageOnly || 'false',
        initPost: row.initPost || 0,
        pinnedPost: row.pinnedPost || '',
        feedName: row.feedName || '',
        feedDescription: row.feedDescription || '',
        limitCount: row.limitCount || 0,
        privateFeed: row.privateFeed || '',
        includeAltText: row.includeAltText || 'true',
        profileMatch: row.profileMatch || '',
        customLabelerDid: row.customLabelerDid || '',
        customLabelerLabelValues: row.customLabelerLabelValues || '',
        embedExternalUrl: row.embedExternalUrl || 'false',
        enableExactMatch: row.enableExactMatch || 'false',
        inputType: row.inputType || '',
        listUri: row.listUri || '',
        invetListUri: row.invetListUri || '',
    }))

    //console.log(conditions)

    return conditions
}

export async function checkRecord(condition: Conditions, record: record, did: string, serProfileStringsMap: Map<string, string>): Promise<boolean> {
    const invertRegex = new RegExp(condition.invertRegex, 'i') //除外用正規表現

    let inputRegexExp //抽出正規表現
    if ( condition.enableExactMatch==='true') {
      let persedQuery = condition.query as string
      persedQuery = persedQuery.replace(/"/g, "");
      inputRegexExp = new RegExp(persedQuery as string, 'ig')
    } else {
      inputRegexExp = new RegExp(condition.inputRegex as string, 'ig')
    }

    let text = record.text || ''

    if (condition.lang && record.langs) {
        let langs: string[] = [condition.lang]
        if (getIsDuplicate(langs, record.langs)) {
            return false

        }
    }

    // 検索APIがALT TEXTの検索ができないので削除
    if (condition.includeAltText === "true" && record.embed !== undefined && record.embed.images !== undefined) {
        for (let image of record.embed.images) {
            text = text + '\n' + image.alt
        }
    }

    //INPUTにマッチしないものは除外
    const matches = (text.match(inputRegexExp) || []).length
    if (matches == 0) {
        return false
    }

    //埋め込みURL
    if (condition.embedExternalUrl === 'true' && record.embed?.external?.uri) {
        text = text + '\n' + record.embed?.external?.uri
    }

    //Invertにマッチしたものは除外
    if (condition.invertRegex !== '' && text.match(invertRegex)) {
        return false
    }

    //画像フィルタ
    const imageObject = record.embed?.images as imageObject[]
    if (condition.imageOnly === 'imageOnly' && imageObject === undefined) {
        return false
    } else if (condition.imageOnly === 'textOnly' && imageObject !== undefined && imageObject.length > 0) {
        return false
    }

    //リプライ無効の場合は、リプライを除外
    if (condition.replyDisable === "true" && record.reply !== undefined) {
        return false
    }

    if ( condition.profileMatch  !== "") {

        if (serProfileStringsMap.size === 0) {

            const agent = new AtpAgent({
                service: 'https://api.bsky.app'
            })
            let profileDID: string[] = []
            profileDID.push(did)

            const profileResult = await agent.app.bsky.actor.getProfiles({
                actors: profileDID
            })

            for (let profile of profileResult.data.profiles) {
                serProfileStringsMap.set(profile.did, profile.displayName + ' ' + profile.description)
            }
        }

        //プロファイルマッチが有効化されており、かつ、検索ワードの1つにしか合致していない
        let skip = false
        if (condition.profileMatch  !== "") {
            const [textTerm, profileRegexText] = condition.profileMatch.split('::')
            const textTermRegex = new RegExp(textTerm || '', 'ig')       //プロフィールマッチ用正規表現
            const profileRegex = new RegExp(profileRegexText || '', 'i')//除外用正規表現

            const matchesWithProfile = (text.match(textTermRegex) || []).length

            if (process.env.DEBUG_MODE) {
                console.log('text:' + text)
                console.log('matchesWithProfile:' + text.match(textTermRegex) + '  matches:' + matches)
            }

            //プロフィールマッチ用の文言が含まれている、かつ、プロフィールマッチ以外の文言が含まれていない場合
            if (matchesWithProfile > 0 && (matches - matchesWithProfile) == 0) {
                //const profileText = userProfileStringsMap.get(post.author.did) + ' ' + text
                const profileText = serProfileStringsMap.get(did) || ''

                if (process.env.DEBUG_MODE) {
                    console.log(profileText.match(profileRegex))
                }

                //指定された文字が投稿本文に含まれる場合は、Regex指定された文字列がプロフィールになければ除外
                if (!profileText.match(profileRegex)) {
                    skip = true
                    return false
                }
            }
        }

        if (skip) return false
    }

    return true
}
