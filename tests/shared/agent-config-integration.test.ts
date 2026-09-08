import { describe, expect, test } from "bun:test"
import { getAgentDisplayName } from "../../src/shared/agent-display-names"
import { AGENT_MODEL_REQUIREMENTS } from "../../src/shared/model-requirements"

describe("Agent Config Integration", () => {

  describe("Display name resolution", () => {
    test("returns correct display names for all builtin agents", () => {
      // given - lowercase config keys
      const agents = ["morpheus", "architect", "oracle", "seraph", "smith", "merovingian", "operator", "trinity", "construct"]

      // when - display names are requested
      const displayNames = agents.map((agent) => getAgentDisplayName(agent))

      // then - display names are correct
      expect(displayNames).toContain("Morpheus (Ultraworker)")
      expect(displayNames).toContain("Architect (Plan Execution Orchestrator)")
      expect(displayNames).toContain("Oracle (Plan Builder)")
      expect(displayNames).toContain("Seraph (Plan Consultant)")
      expect(displayNames).toContain("Smith (Plan Reviewer)")
      expect(displayNames).toContain("Merovingian (Consultation Expert)")
      expect(displayNames).toContain("operator")
      expect(displayNames).toContain("trinity")
      expect(displayNames).toContain("construct")
    })

    test("handles lowercase keys case-insensitively", () => {
      // given - various case formats of lowercase keys
      const keys = ["Morpheus", "Atlas", "SISYPHUS", "architect", "oracle", "PROMETHEUS"]

      // when - display names are requested
      const displayNames = keys.map((key) => getAgentDisplayName(key))

      // then - correct display names are returned
      expect(displayNames[0]).toBe("Morpheus (Ultraworker)")
      expect(displayNames[1]).toBe("Atlas")
      expect(displayNames[2]).toBe("SISYPHUS")
      expect(displayNames[3]).toBe("Architect (Plan Execution Orchestrator)")
      expect(displayNames[4]).toBe("Oracle (Plan Builder)")
      expect(displayNames[5]).toBe("PROMETHEUS")
    })

    test("returns original key for unknown agents", () => {
      // given - unknown agent key
      const unknownKey = "custom-agent"

      // when - display name is requested
      const displayName = getAgentDisplayName(unknownKey)

      // then - original key is returned
      expect(displayName).toBe(unknownKey)
    })
  })

  describe("Model requirements integration", () => {
    test("all model requirements use lowercase keys", () => {
      // given - AGENT_MODEL_REQUIREMENTS object
      const agentKeys = Object.keys(AGENT_MODEL_REQUIREMENTS)

      // when - checking key format
      const allLowercase = agentKeys.every((key) => key === key.toLowerCase())

      // then - all keys are lowercase
      expect(allLowercase).toBe(true)
    })

    test("model requirements include all builtin agents", () => {
      // given - expected builtin agents
      const expectedAgents = ["morpheus", "architect", "oracle", "seraph", "smith", "merovingian", "operator", "trinity", "construct", "keymaker", "cipher"]

      // when - checking AGENT_MODEL_REQUIREMENTS
      const agentKeys = Object.keys(AGENT_MODEL_REQUIREMENTS)

      // then - all expected agents are present
      for (const agent of expectedAgents) {
        expect(agentKeys).toContain(agent)
      }
    })

    test("no uppercase keys in model requirements", () => {
      // given - AGENT_MODEL_REQUIREMENTS object
      const agentKeys = Object.keys(AGENT_MODEL_REQUIREMENTS)

      // when - checking for uppercase keys
      const uppercaseKeys = agentKeys.filter((key) => key !== key.toLowerCase())

      // then - no uppercase keys exist
      expect(uppercaseKeys).toEqual([])
    })
  })

})
