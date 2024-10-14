

import { record, imageObject, getIsDuplicate } from '../subscription'
import { AtpAgent } from '@atproto/api'
import { Database } from '../db'
import { PostView } from '@atproto/api/dist/client/types/app/bsky/feed/defs';
import * as ComAtprotoLabelDefs from '..'

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
    videoControl: string;
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
        videoControl: row.videoControl || 'false',
    }))

    //console.log(conditions)

    return conditions
}

const addBoundaryForAlphabetWords = (input: string): string => {
    // 入力がカッコで囲まれているかを確認
    const hasParentheses = input.startsWith('(') && input.endsWith(')');

    // カッコがある場合、最初と最後のカッコを除去
    let content = input;
    if (hasParentheses) {
        content = input.slice(1, -1); // カッコを除去
    }

    // 区切り文字で単語を分割する
    const parts = content.split('|');

    // 各部分を処理して、アルファベットのみの単語に条件を追加
    const updatedParts = parts.map((part) => {
        // アルファベットまたは数字のみかどうかを確認
        if (/^[A-Za-zÀ-ÿ0-9]+$/.test(part)) {
            //console.log(part+":アルファベット")
            // アルファベットと数字のみの単語であれば、前後に他のアルファベットや数字がないことを確認
            return `\\b${part}\\b`; // ここでエスケープした正規表現を返す
        }

        // カタカナだけ
        if (/^[ァ-ヴー]+$/.test(part)) {
            //console.log(part+":カタカナ")
            // 前後がカタカナではない場合に条件を追加
            return `(^|[^ァ-ヴ])${part}([^ァ-ヴ]|$)`; // ここでエスケープした正規表現を返す
        }
        //console.log(part+":どれでもない")
        return part; // アルファベット以外の場合はそのまま
    });

    // 処理後のパーツを '|' で再結合
    const result = updatedParts.join('|');

    // もともとカッコがあった場合は再びカッコを追加
    return hasParentheses ? `(${result})` : result;
};


export async function checkRecord(condition: Conditions, record: record, did: string, serProfileStringsMap: Map<string, string>): Promise<boolean> {
    const invertRegex = new RegExp(condition.invertRegex, 'i') //除外用正規表現

    try {
        let inputRegexExp //抽出正規表現
        if (condition.enableExactMatch === 'true') {
            let persedQuery = condition.query as string
            persedQuery = addBoundaryForAlphabetWords(persedQuery.replace(/"/g, ""))
            inputRegexExp = new RegExp(persedQuery as string, 'ig')
        } else {
            inputRegexExp = new RegExp(condition.inputRegex as string, 'ig')
        }

        let text = record.text || ''

        //言語フィルタに何か設定されている
        if (condition.lang) {
            // 投稿のLangがない
            if (!record.langs) {
                return false
            }

            // 投稿のlangに言語フィルタに含まれる言語が含まれていない
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
        } else {
            //            console.log(text)
            //            console.log(text.match(inputRegexExp))
        }
        console.log(inputRegexExp)
        console.log(text.match(inputRegexExp) )

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

        //動画フィルタ
        if (condition.videoControl === 'videoOnly' && record.embed?.$type!=='app.bsky.embed.video') {
            return false
        } else if (condition.videoControl === 'textOnly' && record.embed?.$type==='app.bsky.embed.video') {
            return false
        }

        //リプライ無効の場合は、リプライを除外
        if (condition.replyDisable === "true" && record.reply !== undefined) {
            return false
        }


        if (condition.profileMatch !== "") {

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
            if (condition.profileMatch !== "") {
                const [textTerm, profileRegexText] = condition.profileMatch.split('::')
                let tempTextTeem = textTerm
                let tempProfileRegexText = profileRegexText
                if (condition.enableExactMatch === 'true') {
                    tempTextTeem = addBoundaryForAlphabetWords(tempTextTeem)
                    tempProfileRegexText = addBoundaryForAlphabetWords(tempProfileRegexText)

                }
                const textTermRegex = new RegExp(tempTextTeem || '', 'ig')       //プロフィールマッチ用正規表現
                const profileRegex = new RegExp(tempProfileRegexText || '', 'i')//除外用正規表現
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
    } catch (e) {
        console.error(e)
        console.error(record)
        return false
    }

    return true
}


export async function checkLabel(condition: Conditions, post: PostView){

   //ラベルの仕分け
   let officialLabels: string[] = []
   let customLabels: string[] = []

   if (post.labels) {
     // seachResults.data.posts[0].labels配列の各要素に対して処理を行う
     post.labels.map((label: any) => {
       // 後付けラベル
       if (label.ver) {
         // 公式ラベラー
         if (label.src === 'did:plc:ar7c4by46qjdydhdevvrndac') {
           officialLabels.push(label.val)
         } else {
           // カスタムラベラー
           customLabels.push(label.val)
         }
       } else {
         // セルフラベル
         officialLabels.push(label.val + '(self)');
       }
     })
   }

   //公式ラベルが有効な場合は、ラベルが何かついていたら除外
   if (condition.labelDisable === "true" && officialLabels.length !== 0) {
     return false
   }

   //カスタムラベラーのラベルに値があれば比較する
   let skip = false
   if (condition.customLabelerDid) {
     const labels: string[] = condition.customLabelerLabelValues.split(',')
     if (getIsDuplicate(labels, customLabels)) {
       skip = true
       return false
     }
   }

   return true
}