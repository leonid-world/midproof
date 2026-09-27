import { isMidnightProofBridgeEnabled } from './config'

export function applyMidnightProofDevtoolsPolicy(app) {
  if (isMidnightProofBridgeEnabled) app.config.devtools = false
}
