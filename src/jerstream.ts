import WebSocket from 'ws'
import { Database } from './db'
import { record } from './subscription'

import { Conditions, checkRecord, getConditions } from './util/conditionsCheck'

type Label = {
    $type: string;
    values: { val: string }[];
}

const staticJetstreamParam: string = '/subscribe?wantedCollections=app.bsky.feed.post'

export class WebSocketReceiver {
    private ws: WebSocket | null = null;
    private host: string;
    private time_us: number = 0
    private previousTimeUs: number = 0; // 前回のtime_usを記録するための変数
    private reconnectInterval: number = 5000; // 再接続までの待機時間（ミリ秒
    private count = 0

    constructor(url: string, public db: Database) {
        this.initialize();
        this.startIntervalTask()
    }

    private async initialize() {
        this.host = 'wss://jetstream.atproto.tools'

        if (this.time_us === 0) {

            // Condition tableからオブジェクトを変換
            let conditionBuiler = this.db
                .selectFrom('sub_state')
                .selectAll()
                .where('service', '=', 'jetstream')
            const confitionRes = await conditionBuiler.execute()
            if (confitionRes.length == 0) {
                const oneDayAgo = Date.now();
                const oneDayAgoUnix = Math.floor(oneDayAgo / 1000); // UNIX時間に変換（秒）
                this.time_us = oneDayAgoUnix;
            }else{
                this.time_us = confitionRes[0].cursor
                console.log(`WebSocket subscription restore from: ${this.formatTimestamp(this.time_us)} `);
            }
        }

        const url = this.host + staticJetstreamParam + '&cursor=' + this.time_us
        console.log('WebSocket try to connect to:' + url)

        this.ws = new WebSocket(this.host + staticJetstreamParam + '&cursor=' + this.time_us);  // 新しい接続を作成

        this.setupListeners();
    }

    /*
    public async setupConnection(db: Database): Promise<void> {
        if (this.ws) {
            this.ws.close();
        }

        let conditions: Conditions[] = await getConditions(this.db);
        let newConfitions: Conditions[] = []

        for (let condition of conditions)
            if (condition.inputType === 'jetstream') {
                newConfitions.push(condition)
            }

        if (newConfitions.length > 0) {
            if (this.time_us === 0) {
                const oneDayAgo = Date.now();
                const oneDayAgoUnix = Math.floor(oneDayAgo / 1000); // UNIX時間に変換（秒）
                this.time_us = oneDayAgoUnix;
            }

            const url = this.host + staticJetstreamParam + '&cursor=' + this.time_us
            console.log('WebSocket try to connect to:' + url)

            this.ws = new WebSocket(this.host + staticJetstreamParam + '&cursor=' + this.time_us);  // 新しい接続を作成
            await this.setupListeners();  // リスナーをセットアップ
        } else {
            console.log('There is no condition for Jetstream')

        }
    }
        */

    // WebSocket のリスナーを設定
    private async setupListeners(): Promise<void> {
        if (!this.ws) return;  // WebSocket がない場合は処理を中断
        this.ws.on('open', () => {
            console.log('WebSocket connection established:' + this.host);
        });

        this.ws.on('message', async (data) => {
            try {
                const event = JSON.parse(data.toString()); // 受信したデータをJSONとしてパース

                //commitがなければスキップ（Accountイベント）
                if (!event.commit) {
                    //console.log('event.commit')
                    //console.log(event)
                    return

                }
                if (!event.commit.type) {
                    console.log('event.commit.type')
                    console.log(event)
                    return

                }

                if (event.time_us) {
                    this.time_us = event.time_us
                }

                const type = event.commit.type
                if (type === 'c') {
                    //console.log(this.formatTimestamp(event.time_us))
                    this.count++
                    const post = event.commit.record as record
                    let conditions: Conditions[] = await getConditions(this.db);

                    let newConfitions: Conditions[] = []

                    for (let condition of conditions)
                        if (condition.inputType === 'jetstream') {
                            newConfitions.push(condition)
                        }

                    for (const row of newConfitions) {
                        if (await checkRecord(row, post, event.did, new Map<string, string>)) {

                            //
                            if (row.labelDisable === 'false' || (row.labelDisable === 'true' && !post.labels)) {

                                console.log(event.commit)
                                const postsToCreate = {
                                    uri: 'at://' + event.did + '/app.bsky.feed.post/' + event.commit.rkey,
                                    key: row.key,
                                    cid: event.commit.cid,
                                    indexedAt: post.createdAt,
                                    inputType: 'jetstream'
                                }

                                console.log(postsToCreate)
                                this.db
                                    .insertInto('post')
                                    .values(postsToCreate)
                                    .onConflict(oc => oc.doNothing())
                                    .execute()


                            }
                        }
                    }

                } else if (type === 'd') {
                    //console.log(this.formatTimestamp(event.time_us))
                    //console.log('delete')

                }

            } catch (error) {
                console.error('Failed to parse message:', error);
            }
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.ws?.close(); // エラー発生時にコネクションを閉じる
            this.reconnect()
        });

        this.ws.on('close', () => {
            console.log('WebSocket connection closed');
            this.reconnect()
        });
    }

    private startIntervalTask() {
        setInterval(() => {
            this.executeTask(); // 1分ごとに実行するメソッド
        }, 60000); // 60000ミリ秒 = 1分
    }

    private async executeTask() {
        console.log(`Websocket current time_us : ${this.formatTimestamp(this.time_us)}  count : ${this.count}`);

        if (this.time_us === 0) return;

        // 現在の time_us が前回の値と同じ場合に this.initialize() を呼び出す
        if (this.time_us === this.previousTimeUs) {
            console.log('time_us has not changed. Reinitializing...');
            await this.initialize(); // initialize を呼び出して再接続
        }

        // 前回のtime_usを更新
        this.previousTimeUs = this.time_us;

        // バックフィル用のカーソル保存
        let obj = {
            service: 'jetstream',
            cursor: this.time_us,
        };

        await this.db
            .insertInto('sub_state')
            .values(obj)
            .onConflict(oc => oc
                .columns(['service'])
                .doUpdateSet({ cursor: obj.cursor })
            )
            .execute();
    }


    private reconnect(): void {
        setTimeout(() => {
            console.log('Reconnecting to WebSocket...');
            this.initialize(); // 再接続処理
        }, this.reconnectInterval); // 再接続までの待機時間
    }

    private formatTimestamp(microseconds: number): string {
        const milliseconds = Math.floor(microseconds / 1000); // マイクロ秒をミリ秒に変換
        const date = new Date(milliseconds); // Dateオブジェクトを作成

        // YYYY-MM-DD HH:MM:SS形式にフォーマット
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');

        const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

        // 現在のSYSDATEとの差分を計算
        const now = Date.now(); // 現在の時刻を取得（ミリ秒）
        const diffMilliseconds = now - milliseconds; // 差分をミリ秒で計算

        // 差分を秒、分、時間でフォーマット
        const diffSeconds = Math.floor(diffMilliseconds / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);

        const diffFormatted = diffHours > 0
            ? `${diffHours}時間${diffMinutes % 60}分前`
            : diffMinutes > 0
                ? `${diffMinutes}分${diffSeconds % 60}秒前`
                : `${diffSeconds}秒前`;

        return `${formattedDate} (${diffFormatted})`;
    }

    public currentTimeUs(): string {

        return this.time_us.toString()

    }

}
