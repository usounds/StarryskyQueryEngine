import WebSocket from 'ws'
import { PostView } from './lexicon/types/app/bsky/feed/defs'
import { Database } from './db'
import { record } from './subscription'

const staticJetstreamParam: string = '/subscribe?wantedCollections=app.bsky.feed.post'

export class WebSocketReceiver {
    private ws: WebSocket | null = null;
    private host: string;
    private time_us: number
    private reconnectInterval: number = 5000; // 再接続までの待機時間（ミリ秒

    constructor(url: string, public db: Database) {
        this.initialize(url);
        this.startIntervalTask()
    }

    private async initialize(host: string) {
        this.host = host

        //バックフィル用のカーソル復元
        try {
            let builder = this.db
                .selectFrom('sub_state')
                .selectAll()
                .where('service', '=', 'jetstream');

            const res = await builder.execute();

            if (res[0].cursor) {
                this.time_us = res[0].cursor;
            }

        } catch (e) {
            const oneDayAgo = Date.now() - 2 * 60 * 60 * 1000; // 1日前のミリ秒
            const oneDayAgoUnix = Math.floor(oneDayAgo / 1000); // UNIX時間に変換（秒）
            this.time_us = oneDayAgoUnix;

        }

        this.setupConnection()
    }

    private setupConnection(): void {
        if (this.ws) {
            this.ws.close();
        }

        const url = this.host + staticJetstreamParam + '&cursor=' + this.time_us
        console.log('WebSocket try to connect to:'+url)

        this.ws = new WebSocket(this.host + staticJetstreamParam + '&cursor=' + this.time_us);  // 新しい接続を作成
        this.setupListeners();  // リスナーをセットアップ
    }

    // WebSocket のリスナーを設定
    private setupListeners(): void {
        if (!this.ws) return;  // WebSocket がない場合は処理を中断
        this.ws.on('open', () => {
            console.log('WebSocket connection established:' + this.host);
        });

        this.ws.on('message', (data) => {
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
                    //const post = event.commit.record as record
                    //console.log(post.text)

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

    // URL を変更するメソッド
    public changeUrl(newUrl: string): void {
        console.log(`Changing WebSocket URL from ${this.host} to ${newUrl}`);
        this.host = newUrl;  // URL を更新
        this.setupConnection();  // 新しい URL で接続を再初期化
    }

    private startIntervalTask() {
        setInterval(() => {
            this.executeTask(); // 1分ごとに実行するメソッド
        }, 60000); // 60000ミリ秒 = 1分
    }

    private async executeTask() {
        console.log(`カーソル更新 at ${this.formatTimestamp(this.time_us)} `);

        if(!this.time_us) return

        // バックフィル用のカーソル保存
        let obj = {
            service: 'jetstream',
            cursor: this.time_us,
        }

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
            this.setupConnection(); // 再接続処理
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

}
