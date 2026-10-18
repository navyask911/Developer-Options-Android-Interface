package com.utility.devoptions

enum class AppPrompt { UPDATE, OFFLINE, REVIEW }
object PromptPolicy {
 const val DAY_MS=86400000L
 const val INTER_PROMPT_COOLDOWN_MS=10L*60L*1000L
 const val REVIEW_PROMPT_COOLDOWN_MS=30L*DAY_MS
 const val AUTO_REVIEW_COOLDOWN_MS=90L*DAY_MS
 fun cooldownElapsed(last:Long,now:Long,cooldown:Long)=last<=0L || now<last || now-last>=cooldown
 fun shouldShowUpdate(confirmed:Boolean,last:Long,now:Long)=confirmed && cooldownElapsed(last,now,DAY_MS)
 fun shouldShowOffline(validated:Boolean,shownThisSession:Boolean)=!validated && !shownThisSession
 fun shouldShowReviewPrompt(sessions:Int,last:Long,now:Long)=sessions>=3 && cooldownElapsed(last,now,REVIEW_PROMPT_COOLDOWN_MS)
 fun shouldRequestAutomaticReview(sessions:Int,actions:Int,lastRequest:Long,lastPrompt:Long,now:Long)=sessions>=5 && actions>=3 && cooldownElapsed(lastRequest,now,AUTO_REVIEW_COOLDOWN_MS) && cooldownElapsed(lastPrompt,now,REVIEW_PROMPT_COOLDOWN_MS)
}
