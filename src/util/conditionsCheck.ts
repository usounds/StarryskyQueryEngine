

import { record, imageObject, getIsDuplicate } from '../subscription'
import { AtpAgent } from '@atproto/api'
import { Database } from '../db'


const agent = new AtpAgent({
    service: 'https://api.bsky.app'
})


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
        .orderBy('key')
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
        inputType: row.inputType || 'query',
        listUri: row.listUri || '',
        invetListUri: row.invetListUri || '',
    }))

    //console.log(conditions)

    return conditions
}

const addBoundaryForAlphabetWords = (input: string): string => {
    // 区切り文字で単語を分割する
    const parts = input.split('|');
  
    // 各部分を処理して、アルファベットのみの単語に条件を追加
    const updatedParts = parts.map((part) => {
      // アルファベットのみかどうかを確認
      if (/^[A-Za-z0-9]+$/.test(part)) {
        // アルファベットのみの単語であれば前後に否定の先読み・後読みを追加
        return `(?<![A-Za-z0-9])${part}(?![A-Za-z0-9])`;
      }
      return part; // アルファベット以外の場合はそのまま
    });
  
    // 処理後のパーツを '|' で再結合して返す
    return updatedParts.join('|');
  };
  

export async function checkRecord(condition: Conditions, record: record, did: string, serProfileStringsMap: Map<string, string>): Promise<boolean> {
    const invertRegex = new RegExp(condition.invertRegex, 'i') //除外用正規表現

    try{
    let inputRegexExp //抽出正規表現
    if ( condition.enableExactMatch==='true') {
      let persedQuery = condition.query as string
      persedQuery = addBoundaryForAlphabetWords(persedQuery.replace(/"/g, ""))
      inputRegexExp = new RegExp(persedQuery as string, 'ig')
    } else {
      inputRegexExp = new RegExp(condition.inputRegex as string, 'ig')
    }

    let text = record.text || ''

    if (condition.lang && record.langs) {
        if (!record.langs.includes(condition.lang)) {
            return false
        }
    }    

    // ALT Textも検索する場合は文字列をくっつける
    if (condition.includeAltText === "true" && record.embed && record.embed.images) {
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
                    return false
                }
            }
        }

    }

    //除外リスト
    if (condition.invetListUri) {
        let inverDidSet = new Set<string>();
        const result = await agent.app.bsky.graph.getList(
          {
            list: condition.invetListUri,
            limit: 100
          }
        )
  
        for (let obj of result.data.items) {
          inverDidSet.add(obj.subject.did)
        }


        if (inverDidSet.size > 0 && inverDidSet.has(did)) {
            return false
          }

      }
    }catch(e){
        console.error(e)
        console.error(record)
        return false
    }

    return true
}
