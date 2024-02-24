export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  conditions: Conditions
}

export type Post = {
  uri: string
  cid: string
  replyParent: string | null
  replyRoot: string | null
  indexedAt: string
}

export type SubState = {
  service: string
  cursor: number
}


export type Conditions = {
  key: string
  query: string
  inputRegex: string
  invertRegex: string | null
  refresh: number
}
