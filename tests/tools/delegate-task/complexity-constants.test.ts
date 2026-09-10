import { describe, expect, test } from "bun:test"
import { resolveComplexityModel } from "../../../src/tools/delegate-task/complexity-constants"

describe("resolveComplexityModel", () => {
	test("level 1 with userDowngrades downgrades to synthetic model", () => {
		//#given — synthetic downgrade map
		const userDowngrades = { "1": "provider-a/model-fast" }
		//#when
		const result = resolveComplexityModel("source", 1, "provider-x/model-orig", userDowngrades)
		//#then
		expect(result.model).toBe("provider-a/model-fast")
		expect(result.downgraded).toBe(true)
	})

	test("level 2 with userDowngrades downgrades to synthetic model", () => {
		//#given
		const userDowngrades = { "2": "provider-b/model-cheap" }
		//#when
		const result = resolveComplexityModel("source", 2, "provider-x/model-orig", userDowngrades)
		//#then
		expect(result.model).toBe("provider-b/model-cheap")
		expect(result.downgraded).toBe(true)
	})

	test("level 3 returns original even when downgrade exists (not downgradable)", () => {
		//#given
		const userDowngrades = { "3": "provider-a/model-fast" }
		//#when
		const result = resolveComplexityModel("source", 3, "provider-x/model-orig", userDowngrades)
		//#then
		expect(result.model).toBe("provider-x/model-orig")
		expect(result.downgraded).toBe(false)
	})

	test("no downgrade entry returns original", () => {
		//#given — empty map, category has no downgrade
		const result = resolveComplexityModel("bullet-time", 1, "provider-x/model-orig", {})
		//#then
		expect(result.model).toBe("provider-x/model-orig")
		expect(result.downgraded).toBe(false)
	})

	test("undefined userDowngrades and empty config returns original", () => {
		//#given — no config, no userDowngrades
		const result = resolveComplexityModel("source", 1, "provider-x/model-orig")
		//#then
		expect(result.model).toBe("provider-x/model-orig")
		expect(result.downgraded).toBe(false)
	})

	test("userDowngrades wins over global complexityDowngrades", () => {
		//#given
		const userDowngrades = { "1": "provider-a/model-user" }
		const config = { complexityDowngrades: { source: { "1": "provider-b/model-global" } } }
		//#when
		const result = resolveComplexityModel("source", 1, "provider-x/model-orig", userDowngrades, config)
		//#then
		expect(result.model).toBe("provider-a/model-user")
		expect(result.downgraded).toBe(true)
	})

	test("global complexityDowngrades used when userDowngrades undefined", () => {
		//#given
		const config = { complexityDowngrades: { source: { "1": "provider-b/model-global" } } }
		//#when
		const result = resolveComplexityModel("source", 1, "provider-x/model-orig", undefined, config)
		//#then
		expect(result.model).toBe("provider-b/model-global")
		expect(result.downgraded).toBe(true)
	})

	test("tier: value resolved via live tier resolver", () => {
		//#given — downgrade is tier:fast, tiers config maps fast to provider-a/model-fast
		const config = {
			complexityDowngrades: { source: { "1": "tier:fast" } },
			tiers: { fast: { providerPriority: ["provider-a"], modelPattern: "model-fast" } },
		}
		const tierContext = {
			availableModels: new Set(["provider-a/model-fast", "provider-a/model-other"]),
			connectedProviders: ["provider-a"],
		}
		//#when
		const result = resolveComplexityModel("source", 1, "provider-x/model-orig", undefined, config, tierContext)
		//#then
		expect(result.model).toBe("provider-a/model-fast")
		expect(result.downgraded).toBe(true)
	})

	test("tier: with missing context returns original (no downgrade)", () => {
		//#given — tier value but no tierContext/tiers provided
		const config = { complexityDowngrades: { source: { "1": "tier:fast" } } }
		//#when
		const result = resolveComplexityModel("source", 1, "provider-x/model-orig", undefined, config)
		//#then
		expect(result.model).toBe("provider-x/model-orig")
		expect(result.downgraded).toBe(false)
	})

	test("tier: with unresolvable tier returns original", () => {
		//#given — tier name not in config
		const config = {
			complexityDowngrades: { source: { "1": "tier:missing" } },
			tiers: { fast: { providerPriority: ["provider-a"], modelPattern: "model-fast" } },
		}
		const tierContext = { availableModels: new Set(["provider-a/model-fast"]), connectedProviders: ["provider-a"] }
		//#when
		const result = resolveComplexityModel("source", 1, "provider-x/model-orig", undefined, config, tierContext)
		//#then
		expect(result.model).toBe("provider-x/model-orig")
		expect(result.downgraded).toBe(false)
	})
})
