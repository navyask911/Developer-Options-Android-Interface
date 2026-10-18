package com.utility.devoptions
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
class PromptPolicyTest {
 @Test fun updateNeedsPlayConfirmationAndCooldown() { val n=100*PromptPolicy.DAY_MS; assertFalse(PromptPolicy.shouldShowUpdate(false,0,n)); assertTrue(PromptPolicy.shouldShowUpdate(true,0,n)); assertFalse(PromptPolicy.shouldShowUpdate(true,n-PromptPolicy.DAY_MS+1,n)); assertTrue(PromptPolicy.shouldShowUpdate(true,n-PromptPolicy.DAY_MS,n)) }
 @Test fun offlineNeedsUnvalidatedNetworkAndOneDisplayPerSession() { assertTrue(PromptPolicy.shouldShowOffline(false,false)); assertFalse(PromptPolicy.shouldShowOffline(true,false)); assertFalse(PromptPolicy.shouldShowOffline(false,true)) }
 @Test fun reviewPromptUsesSessionThresholdAndCooldown() { val n=100*PromptPolicy.DAY_MS; assertFalse(PromptPolicy.shouldShowReviewPrompt(2,0,n)); assertTrue(PromptPolicy.shouldShowReviewPrompt(3,0,n)); assertFalse(PromptPolicy.shouldShowReviewPrompt(4,n-PromptPolicy.REVIEW_PROMPT_COOLDOWN_MS+1,n)) }
 @Test fun promptsUseAnInterruptionCooldownAcrossTypes() { val now=100*PromptPolicy.DAY_MS; assertFalse(PromptPolicy.cooldownElapsed(now-1,now,PromptPolicy.INTER_PROMPT_COOLDOWN_MS)); assertTrue(PromptPolicy.cooldownElapsed(now-PromptPolicy.INTER_PROMPT_COOLDOWN_MS,now,PromptPolicy.INTER_PROMPT_COOLDOWN_MS)) }
 @Test fun automaticReviewNeedsMeaningfulUseAndLongCooldown() { val n=200*PromptPolicy.DAY_MS; assertFalse(PromptPolicy.shouldRequestAutomaticReview(4,5,0,0,n)); assertFalse(PromptPolicy.shouldRequestAutomaticReview(5,2,0,0,n)); assertTrue(PromptPolicy.shouldRequestAutomaticReview(5,3,0,0,n)); assertFalse(PromptPolicy.shouldRequestAutomaticReview(5,3,n-PromptPolicy.AUTO_REVIEW_COOLDOWN_MS+1,0,n)) }
}