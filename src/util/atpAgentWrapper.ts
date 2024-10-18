import { AtpAgent } from '@atproto/api'

export async function sessionCheck(agent: AtpAgent): Promise<void> {

    // 2回目
    try {
        // セッションチェック
        console.log("sessionCheck")
        await agent.com.atproto.server.getSession()
        return

    } catch (e) {
        try {
            console.log("セッション死んでいる")
            await agent.com.atproto.server.refreshSession()
        } catch (e) {
            console.log("リフレッシュ失敗 - ログイン")
            if (process.env.FEEDGEN_PUBLISHER_IDENTIFIER && process.env.FEEDGEN_APP_PASSWORD) {
                await agent.login({
                    identifier: process.env.FEEDGEN_PUBLISHER_IDENTIFIER || '',
                    password: process.env.FEEDGEN_APP_PASSWORD || ''
                })
                console.log("ログイン成功")
            }else{
                console.log("ユーザーパスワード未指定")

            }

            return

        }

    }


}