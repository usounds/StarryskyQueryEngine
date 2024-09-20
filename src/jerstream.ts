import WebSocket from 'ws'
import { PostView } from './lexicon/types/app/bsky/feed/defs'
import { Database } from './db'

export class WebSocketReceiver {
  private ws: WebSocket | null = null; 
  private url: string; 

  constructor(url: string) {
    this.url = url; 
    this.setupConnection();
  }

  private setupConnection(): void {
    if (this.ws) {
      this.ws.close(); 
    }

    this.ws = new WebSocket(this.url);  // 新しい接続を作成
    this.setupListeners();  // リスナーをセットアップ
  }

  // WebSocket のリスナーを設定
  private setupListeners(): void {
    if (!this.ws) return;  // WebSocket がない場合は処理を中断
    this.ws.on('open', () => {
      console.log('WebSocket connection established:'+this.url);
    });

    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString()); // 受信したデータをJSONとしてパース

        //commitがなければスキップ（Accountイベント）
        if(!event.commit){
            console.log('event.commit')
            //console.log(event)
            return

        }
        if(!event.commit.type){
            console.log('event.commit.type')
            console.log(event)
            return

        }

        const type = event.commit.type
        if(type === 'c'){
            //console.log(this.formatTimestamp(event.time_us))
            const post = event.commit.record as PostView
            //console.log(post)

        }else if(type === 'd'){
            //console.log(this.formatTimestamp(event.time_us))
            //console.log('delete')

        }

      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('WebSocket connection closed');
    });
  }

  // URL を変更するメソッド
  public changeUrl(newUrl: string): void {
    console.log(`Changing WebSocket URL from ${this.url} to ${newUrl}`);
    this.url = newUrl;  // URL を更新
    this.setupConnection();  // 新しい URL で接続を再初期化
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
