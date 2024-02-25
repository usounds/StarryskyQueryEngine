import dotenv from 'dotenv'
import { AtpAgent } from '@atproto/api'

const run = async () => {
  dotenv.config()
  const handle = process.env.FEEDGEN_PUBLISHER_IDENTIFIER || ''
  const password = process.env.FEEDGEN_APP_PASSWORD || ''
  const recordName = process.env.FEEDGEN_RECORD_NAME || ''

  // only update this if in a test environment
  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password })

  const did = agent.session?.did ?? ''

  /*
  const checkRecord = {
    feed:'at://' + did + '/app.bsky.feed.generator/' + recordName
  }

  console.log(checkRecord)

  try {
    await agent.api.app.bsky.feed.getFeedGenerator(checkRecord)
  } catch (err) {
    throw new Error(
      'The specified feed is not registered.',
    )
  }
  */

  let record = {
    repo: did,
    collection: 'app.bsky.feed.generator',
    rkey: recordName,
  }
  let recordJSON = JSON.stringify(record, null, 2);
  console.log(`Deleting record ${recordJSON}`)
  let response = await agent.api.com.atproto.repo.deleteRecord(record);
  let responseJSON = JSON.stringify(response, null, 2);
  console.log(`Response: ${responseJSON}`)
}

run()
