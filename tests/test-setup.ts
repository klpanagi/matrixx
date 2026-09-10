import { beforeEach } from "bun:test"
import { _resetFailureCountersForTesting, _resetForTesting } from "../src/features/session-state/state"
import { _resetAssemblyStateForTesting } from "../src/features/assembly-state/manager"
import { _resetPruneThrottleForTesting } from "../src/features/background-agent/manager"
import { _resetMessageDirCacheForTesting } from "../src/features/background-agent/message-dir"
import { _resetTaskToastManagerForTesting } from "../src/features/task-toast-manager/manager"
import { _resetUltraworkStateForTesting } from "../src/features/ultrawork-state/manager"
import { _resetRuleCacheForTesting } from "../src/hooks/rules-injector/injector"
import { _resetThinkModeStateForTesting } from "../src/hooks/think-mode/hook"
import { _resetNormalizeModelCacheForTesting } from "../src/hooks/think-mode/switcher"
import { _resetDisabledSetsCacheForTesting } from "../src/plugin-config"
import { _resetMessagesTransformCacheForTesting } from "../src/plugin/messages-transform"

beforeEach(() => {
  _resetForTesting()
  _resetFailureCountersForTesting()
  _resetAssemblyStateForTesting()
  _resetPruneThrottleForTesting()
  _resetMessageDirCacheForTesting()
  _resetTaskToastManagerForTesting()
  _resetUltraworkStateForTesting()
  _resetRuleCacheForTesting()
  _resetThinkModeStateForTesting()
  _resetNormalizeModelCacheForTesting()
  _resetDisabledSetsCacheForTesting()
  _resetMessagesTransformCacheForTesting()
})
