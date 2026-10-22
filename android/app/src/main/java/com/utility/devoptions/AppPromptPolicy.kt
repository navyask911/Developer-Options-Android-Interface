package com.utility.devoptions

enum class AppPrompt { UPDATE, OFFLINE, REVIEW }

object PromptPolicy {
    const val DAY_MS = 86_400_000L
    const val INTER_PROMPT_COOLDOWN_MS = 10L * 60L * 1000L
    const val REVIEW_PROMPT_COOLDOWN_MS = 30L * DAY_MS
    const val AUTO_REVIEW_COOLDOWN_MS = 90L * DAY_MS
    const val MIN_REVIEW_SESSIONS = 3
    const val MIN_MEANINGFUL_ACTIONS_FOR_REVIEW = 3
    const val MIN_AUTO_REVIEW_SESSIONS = 5
    const val MIN_MEANINGFUL_ACTIONS_FOR_AUTO_REVIEW = 3

    fun cooldownElapsed(last: Long, now: Long, cooldown: Long): Boolean =
        last <= 0L || now < last || now - last >= cooldown

    fun shouldShowUpdate(confirmed: Boolean, last: Long, now: Long): Boolean =
        confirmed && cooldownElapsed(last, now, DAY_MS)

    fun shouldShowOffline(validated: Boolean, shownThisSession: Boolean): Boolean =
        !validated && !shownThisSession

    fun hasMeaningfulReviewUsage(sessions: Int, actions: Int): Boolean =
        sessions >= MIN_REVIEW_SESSIONS && actions >= MIN_MEANINGFUL_ACTIONS_FOR_REVIEW

    fun shouldShowReviewPrompt(sessions: Int, actions: Int, last: Long, now: Long): Boolean =
        hasMeaningfulReviewUsage(sessions, actions) &&
            cooldownElapsed(last, now, REVIEW_PROMPT_COOLDOWN_MS)

    fun shouldRequestAutomaticReview(
        sessions: Int,
        actions: Int,
        lastRequest: Long,
        lastPrompt: Long,
        now: Long
    ): Boolean =
        sessions >= MIN_AUTO_REVIEW_SESSIONS &&
            actions >= MIN_MEANINGFUL_ACTIONS_FOR_AUTO_REVIEW &&
            cooldownElapsed(lastRequest, now, AUTO_REVIEW_COOLDOWN_MS) &&
            cooldownElapsed(lastPrompt, now, REVIEW_PROMPT_COOLDOWN_MS)

    /** Selects one prompt at a time; consent, update and connectivity outrank review requests. */
    fun selectPrompt(
        current: AppPrompt?,
        consentResolved: Boolean,
        updateConfirmed: Boolean,
        lastUpdateShown: Long,
        validatedInternet: Boolean,
        offlineShownThisSession: Boolean,
        sessions: Int,
        meaningfulActions: Int,
        lastReviewPromptShown: Long,
        lastAnyPromptShown: Long,
        now: Long
    ): AppPrompt? {
        if (!consentResolved) return null

        // Retain an already-visible update prompt even though its timestamp starts its cooldown.
        if (updateConfirmed &&
            (current == AppPrompt.UPDATE || shouldShowUpdate(true, lastUpdateShown, now))
        ) return AppPrompt.UPDATE

        if (!validatedInternet) {
            if (current == AppPrompt.OFFLINE) return AppPrompt.OFFLINE
            if (shouldShowOffline(false, offlineShownThisSession) &&
                cooldownElapsed(lastAnyPromptShown, now, INTER_PROMPT_COOLDOWN_MS)
            ) return AppPrompt.OFFLINE
            return null
        }

        // Retain a review dialog until the user dismisses it; the display timestamp is already set.
        if (current == AppPrompt.REVIEW && hasMeaningfulReviewUsage(sessions, meaningfulActions)) {
            return AppPrompt.REVIEW
        }

        if (shouldShowReviewPrompt(sessions, meaningfulActions, lastReviewPromptShown, now) &&
            cooldownElapsed(lastAnyPromptShown, now, INTER_PROMPT_COOLDOWN_MS)
        ) return AppPrompt.REVIEW

        return null
    }
}


/** Select honest offline copy without treating a missing billing response as a purchase. */
enum class OfflineMessageVariant { AD_SUPPORTED, AD_FREE, UNVERIFIED }

object OfflineMessagePolicy {
    fun choose(isAdsRemoved: Boolean, entitlementKnown: Boolean): OfflineMessageVariant = when {
        !entitlementKnown -> OfflineMessageVariant.UNVERIFIED
        isAdsRemoved -> OfflineMessageVariant.AD_FREE
        else -> OfflineMessageVariant.AD_SUPPORTED
    }
}
