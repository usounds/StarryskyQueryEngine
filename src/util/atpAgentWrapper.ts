import { AtpAgent } from '@atproto/api'

export async function sessionCheck(agent: AtpAgent): Promise<void> {

    // 2回目
    try {
        // セッションチェック
        console.log("2回目以降")
        await agent.com.atproto.server.getSession()
        console.log("2回目以降 - セッション生きてた")
        return

    } catch (e) {
        try {
            console.log("2回目以降 - セッション死んでいる")
            await agent.com.atproto.server.refreshSession()
        } catch (e) {
            console.log("2回目以降 - ログイン")
            await agent.login({
                identifier: process.env.FEEDGEN_PUBLISHER_IDENTIFIER || '',
                password: process.env.FEEDGEN_APP_PASSWORD || ''
            })

            return

        }

    }


}