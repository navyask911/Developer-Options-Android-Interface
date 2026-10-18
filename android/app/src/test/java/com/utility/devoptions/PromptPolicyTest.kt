package com.utility.devoptions

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PromptPolicyTest {
    @Test
    fun updateNeedsPlayConfirmationAndCooldown() {
        val now = 100 * PromptPolicy.DAY_MS
        assertFalse(PromptPolicy.shouldShowUpdate(false, 0, now))
        assertTrue(PromptPolicy.shouldShowUpdate(true, 0, now))
        assertFalse(PromptPolicy.shouldShowUpdate(true, now - PromptPolicy.DAY_MS + 1, now))
        assertTrue(PromptPolicy.shouldShowUpdate(true, now - PromptPolicy.DAY_MS, now))
    }

    @Test
    fun offlineNeedsUnvalidatedNetworkAndOneDisplayPerSession() {
        assertTrue(PromptPolicy.shouldShowOffline(false, false))
        assertFalse(PromptPolicy.shouldShowOffline(true, false))
        assertFalse(PromptPolicy.shouldShowOffline(false, true))
    }

    @Test
    fun reviewNeedsBothSessionHistoryAndMeaningfulActions() {
        val now = 100 * PromptPolicy.DAY_MS
        assertFalse(PromptPolicy.shouldShowReviewPrompt(2, 10, 0, now))
        assertFalse(PromptPolicy.shouldShowReviewPrompt(3, 2, 0, now))
        assertTrue(PromptPolicy.shouldShowReviewPrompt(3, 3, 0, now))
        assertFalse(PromptPolicy.shouldShowReviewPrompt(4, 4, now - PromptPolicy.REVIEW_PROMPT_COOLDOWN_MS + 1, now))
        assertTrue(PromptPolicy.shouldShowReviewPrompt(4, 4, now - PromptPolicy.REVIEW_PROMPT_COOLDOWN_MS, now))
    }

    @Test
    fun promptsUseAnInterruptionCooldownAcrossTypes() {
        val now = 100 * PromptPolicy.DAY_MS
        assertFalse(PromptPolicy.cooldownElapsed(now - 1, now, PromptPolicy.INTER_PROMPT_COOLDOWN_MS))
        assertTrue(PromptPolicy.cooldownElapsed(now - PromptPolicy.INTER_PROMPT_COOLDOWN_MS, now, PromptPolicy.INTER_PROMPT_COOLDOWN_MS))
    }

    @Test
    fun automaticReviewNeedsMeaningfulUseAndLongCooldown() {
        val now = 200 * PromptPolicy.DAY_MS
        assertFalse(PromptPolicy.shouldRequestAutomaticReview(4, 5, 0, 0, now))
        assertFalse(PromptPolicy.shouldRequestAutomaticReview(5, 2, 0, 0, now))
        assertTrue(PromptPolicy.shouldRequestAutomaticReview(5, 3, 0, 0, now))
        assertFalse(PromptPolicy.shouldRequestAutomaticReview(5, 3, now - PromptPolicy.AUTO_REVIEW_COOLDOWN_MS + 1, 0, now))
    }

    @Test
    fun unresolvedConsentBlocksEveryInformationalPrompt() {
        val now = 200 * PromptPolicy.DAY_MS
        assertEquals(null, PromptPolicy.selectPrompt(
            current = null, consentResolved = false, updateConfirmed = true, lastUpdateShown = 0,
            validatedInternet = false, offlineShownThisSession = false, sessions = 10,
            meaningfulActions = 10, lastReviewPromptShown = 0, lastAnyPromptShown = 0, now = now
        ))
    }

    @Test
    fun updateTakesPriorityOverOfflineAndReview() {
        val now = 200 * PromptPolicy.DAY_MS
        assertEquals(AppPrompt.UPDATE, PromptPolicy.selectPrompt(
            current = null, consentResolved = true, updateConfirmed = true, lastUpdateShown = 0,
            validatedInternet = false, offlineShownThisSession = false, sessions = 10,
            meaningfulActions = 10, lastReviewPromptShown = 0, lastAnyPromptShown = 0, now = now
        ))
    }

    @Test
    fun offlineTakesPriorityOverReviewAndIsShownOnlyOncePerSession() {
        val now = 200 * PromptPolicy.DAY_MS
        val first = PromptPolicy.selectPrompt(
            current = null, consentResolved = true, updateConfirmed = false, lastUpdateShown = 0,
            validatedInternet = false, offlineShownThisSession = false, sessions = 10,
            meaningfulActions = 10, lastReviewPromptShown = 0, lastAnyPromptShown = 0, now = now
        )
        assertEquals(AppPrompt.OFFLINE, first)
        val afterDismiss = PromptPolicy.selectPrompt(
            current = null, consentResolved = true, updateConfirmed = false, lastUpdateShown = 0,
            validatedInternet = false, offlineShownThisSession = true, sessions = 10,
            meaningfulActions = 10, lastReviewPromptShown = 0, lastAnyPromptShown = 0, now = now
        )
        assertEquals(null, afterDismiss)
    }

    @Test
    fun reviewIsSelectedOnlyWhenHigherPriorityPromptsAreIneligible() {
        val now = 200 * PromptPolicy.DAY_MS
        assertEquals(AppPrompt.REVIEW, PromptPolicy.selectPrompt(
            current = null, consentResolved = true, updateConfirmed = false, lastUpdateShown = 0,
            validatedInternet = true, offlineShownThisSession = false, sessions = 3,
            meaningfulActions = 3, lastReviewPromptShown = 0, lastAnyPromptShown = 0, now = now
        ))
    }

    @Test
    fun displayedReviewPromptRemainsUntilDismissedEvenWhenItsCooldownStarts() {
        val now = 200 * PromptPolicy.DAY_MS
        assertEquals(AppPrompt.REVIEW, PromptPolicy.selectPrompt(
            current = AppPrompt.REVIEW, consentResolved = true, updateConfirmed = false,
            lastUpdateShown = now, validatedInternet = true, offlineShownThisSession = false,
            sessions = 3, meaningfulActions = 3, lastReviewPromptShown = now,
            lastAnyPromptShown = now, now = now
        ))
    }
}
