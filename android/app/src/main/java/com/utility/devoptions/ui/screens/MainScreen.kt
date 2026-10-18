package com.utility.devoptions.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Usb
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.utility.devoptions.AppPrompt
import com.utility.devoptions.R
import com.utility.devoptions.data.model.DevStatusUiState
import com.utility.devoptions.ui.components.BannerAdView
import com.utility.devoptions.ui.components.DeviceInfoCard
import com.utility.devoptions.ui.components.StatusBadge

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    uiState: DevStatusUiState,
    snackbarHostState: SnackbarHostState,
    isAdsRemoved: Boolean = false,
    onRemoveAds: () -> Unit = {},
    onOpenDeveloperOptions: () -> Unit,
    onShareApp: () -> Unit,
    onManualRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenUsbDebugging: () -> Unit = {},
    onOpenWirelessDebugging: () -> Unit = {},
    onOpenAboutPhone: () -> Unit = {},
    showEnablementGuide: Boolean = false,
    onDismissEnablementGuide: () -> Unit = {},
    selectedLanguageTag: String = "en",
    onSelectLanguage: (String) -> Unit = {},
    suggestedLanguageTag: String? = null,
    onLanguageSuggestionHandled: (String?) -> Unit = {},
    activeAppPrompt: AppPrompt? = null,
    onDismissAppPrompt: (AppPrompt) -> Unit = {},
    onUpdateNow: () -> Unit = {},
    onOpenInternetSettings: () -> Unit = {},
    onReviewOnGooglePlay: () -> Unit = {},
    onShareWithFriends: () -> Unit = {},
    onRateOnGooglePlay: () -> Unit = {},
    onRequestAutomaticReview: () -> Unit = {},
    shouldRequestAutomaticReview: Boolean = false
) {
    val scrollState = rememberScrollState()
    var showLanguagePicker by remember { mutableStateOf(false) }
    val languageChoices = listOf(
        "en" to stringResource(R.string.language_english),
        "ru" to stringResource(R.string.language_russian),
        "hi" to stringResource(R.string.language_hindi),
        "es" to stringResource(R.string.language_spanish),
        "fr" to stringResource(R.string.language_french),
        "ar" to stringResource(R.string.language_arabic),
        "zh-CN" to stringResource(R.string.language_chinese),
        "bn" to stringResource(R.string.language_bengali),
        "de" to stringResource(R.string.language_german),
        "id" to stringResource(R.string.language_indonesian),
        "it" to stringResource(R.string.language_italian),
        "ja" to stringResource(R.string.language_japanese),
        "ko" to stringResource(R.string.language_korean),
        "pt-BR" to stringResource(R.string.language_portuguese),
        "tr" to stringResource(R.string.language_turkish),
        "vi" to stringResource(R.string.language_vietnamese)
    )

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Image(
                            painter = painterResource(id = R.drawable.ic_app_logo),
                            contentDescription = stringResource(R.string.app_name),
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.app_name),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { showLanguagePicker = true }, modifier = Modifier.padding(end = 1.dp)) {
                        Icon(Icons.Default.Language, contentDescription = stringResource(R.string.select_language))
                    }
                    if (!isAdsRemoved) {
                        IconButton(onClick = onRemoveAds, modifier = Modifier.padding(end = 1.dp)) {
                            Icon(
                                imageVector = Icons.Default.Block,
                                contentDescription = stringResource(R.string.remove_ads_description),
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    } else {
                        IconButton(onClick = {}, modifier = Modifier.padding(end = 1.dp)) {
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = stringResource(R.string.ad_free_activated),
                                tint = Color(0xFF4CAF50)
                            )
                        }
                    }
                    IconButton(onClick = onManualRefresh) {
                        Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.refresh_status))
                    }
                    IconButton(onClick = onShareApp) {
                        Icon(Icons.Default.Share, contentDescription = stringResource(R.string.share_application))
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        bottomBar = {
            if (!isAdsRemoved) BannerAdView(isAdsRemoved = false)
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).verticalScroll(scrollState)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = stringResource(R.string.real_time_settings_inspector),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                letterSpacing = 1.sp
            )
            StatusCard(
                title = stringResource(R.string.dev_options_status),
                subtitle = stringResource(R.string.developer_options_status_description),
                isEnabled = uiState.isDeveloperOptionsEnabled,
                icon = { Icon(Icons.Default.Code, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer) },
                iconBackground = MaterialTheme.colorScheme.primaryContainer
            )
            StatusCard(
                title = stringResource(R.string.usb_debugging_status),
                subtitle = stringResource(R.string.usb_debugging_status_description),
                isEnabled = uiState.isUsbDebuggingEnabled,
                icon = { Icon(Icons.Default.Usb, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer) },
                iconBackground = MaterialTheme.colorScheme.secondaryContainer
            )
            Button(
                onClick = onOpenDeveloperOptions,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp)
            ) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text(stringResource(R.string.open_dev_options), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onOpenUsbDebugging, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.Usb, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.usb_debugging), fontSize = 12.sp)
                }
                OutlinedButton(onClick = onOpenWirelessDebugging, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.Wifi, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.wireless_debugging), fontSize = 12.sp)
                }
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onManualRefresh, modifier = Modifier.weight(1f).height(46.dp), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.refresh_status), fontSize = 13.sp)
                }
                OutlinedButton(onClick = onShareApp, modifier = Modifier.weight(1f).height(46.dp), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.share_app), fontSize = 13.sp)
                }
            }
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
            ) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Build, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.enablement_guide_title), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    }
                    Text(stringResource(R.string.how_to_unlock_desc), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(stringResource(R.string.enablement_guide_step_1), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.enablement_guide_step_2), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.enablement_guide_step_3), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.enablement_guide_step_4), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.enablement_guide_step_5), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.manual_enablement_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = onOpenAboutPhone, modifier = Modifier.fillMaxWidth().height(48.dp), shape = RoundedCornerShape(12.dp)) {
                        Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.open_about_phone))
                    }
                }
            }
            DeviceInfoCard(uiState = uiState)
            OutlinedButton(onClick = onRateOnGooglePlay, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = RoundedCornerShape(12.dp)) {
                Text(stringResource(R.string.rate_on_google_play), maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
    }

    if (showLanguagePicker) {
        AlertDialog(
            onDismissRequest = { showLanguagePicker = false },
            title = { Text(stringResource(R.string.language_picker_title)) },
            text = {
                Column(
                    modifier = Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())
                ) {
                    languageChoices.forEach { (tag, label) ->
                        LanguageChoice(tag, label, selectedLanguageTag) {
                            showLanguagePicker = false
                            onSelectLanguage(tag)
                        }
                    }
                    LanguageChoice("system", stringResource(R.string.language_system_default), selectedLanguageTag) {
                        showLanguagePicker = false
                        onSelectLanguage("system")
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showLanguagePicker = false }) { Text(stringResource(R.string.done)) } }
        )
    }

    // Informational prompts share one exclusive slot and yield to language/enablement dialogs.
    if (activeAppPrompt != null && !showLanguagePicker && !showEnablementGuide && suggestedLanguageTag == null) {
        when (activeAppPrompt) {
            AppPrompt.UPDATE -> AlertDialog(
                onDismissRequest = { onDismissAppPrompt(AppPrompt.UPDATE) },
                title = { Text(stringResource(R.string.update_available_title), maxLines = 2, overflow = TextOverflow.Ellipsis) },
                text = { Text(stringResource(R.string.update_available_message), modifier = Modifier.heightIn(max = 240.dp).verticalScroll(rememberScrollState())) },
                confirmButton = { TextButton(onClick = onUpdateNow) { Text(stringResource(R.string.update_now)) } },
                dismissButton = { TextButton(onClick = { onDismissAppPrompt(AppPrompt.UPDATE) }) { Text(stringResource(R.string.later)) } }
            )
            AppPrompt.OFFLINE -> AlertDialog(
                onDismissRequest = { onDismissAppPrompt(AppPrompt.OFFLINE) },
                title = { Text(stringResource(R.string.offline_title), maxLines = 2, overflow = TextOverflow.Ellipsis) },
                text = { Column(Modifier.heightIn(max = 280.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(stringResource(R.string.offline_message))
                    Text(stringResource(R.string.offline_support_message), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } },
                confirmButton = { TextButton(onClick = onOpenInternetSettings) { Text(stringResource(R.string.internet_settings), maxLines = 1, overflow = TextOverflow.Ellipsis) } },
                dismissButton = { TextButton(onClick = { onDismissAppPrompt(AppPrompt.OFFLINE) }) { Text(stringResource(R.string.not_now)) } }
            )
            AppPrompt.REVIEW -> AlertDialog(
                onDismissRequest = { onDismissAppPrompt(AppPrompt.REVIEW) },
                title = { Text(stringResource(R.string.review_prompt_title), maxLines = 3, overflow = TextOverflow.Ellipsis) },
                text = { Column(Modifier.heightIn(max = 280.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.review_prompt_message))
                    TextButton(onClick = onReviewOnGooglePlay) { Text(stringResource(R.string.review_on_google_play)) }
                    TextButton(onClick = onShareWithFriends) { Text(stringResource(R.string.share_with_friends)) }
                    TextButton(onClick = { onDismissAppPrompt(AppPrompt.REVIEW) }) { Text(stringResource(R.string.review_not_now)) }
                } },
                confirmButton = {}, dismissButton = {}
            )
        }
    }
    androidx.compose.runtime.LaunchedEffect(shouldRequestAutomaticReview, activeAppPrompt, showLanguagePicker, showEnablementGuide, suggestedLanguageTag) {
        if (shouldRequestAutomaticReview && activeAppPrompt == null && !showLanguagePicker && !showEnablementGuide && suggestedLanguageTag == null) onRequestAutomaticReview()
    }

    if (showEnablementGuide) {
        AlertDialog(
            onDismissRequest = onDismissEnablementGuide,
            title = { Text(stringResource(R.string.enablement_guide_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.enablement_guide_step_1))
                    Text(stringResource(R.string.enablement_guide_step_2))
                    Text(stringResource(R.string.enablement_guide_step_3))
                    Text(stringResource(R.string.enablement_guide_step_4))
                    Text(stringResource(R.string.enablement_guide_step_5))
                    Text(stringResource(R.string.manual_enablement_note), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            confirmButton = { TextButton(onClick = onOpenAboutPhone) { Text(stringResource(R.string.open_about_phone)) } },
            dismissButton = { TextButton(onClick = onDismissEnablementGuide) { Text(stringResource(R.string.done)) } }
        )
    }

    if (suggestedLanguageTag != null) {
        AlertDialog(
            onDismissRequest = { onLanguageSuggestionHandled(null) },
            title = { Text(stringResource(R.string.language_suggestion_title)) },
            text = {
                Text(stringResource(
                    R.string.language_suggestion_message,
                    nativeLanguageName(suggestedLanguageTag)
                ))
            },
            confirmButton = {
                TextButton(onClick = { onLanguageSuggestionHandled(suggestedLanguageTag) }) {
                    Text(stringResource(R.string.language_switch_to_suggested))
                }
            },
            dismissButton = {
                TextButton(onClick = { onLanguageSuggestionHandled(null) }) {
                    Text(stringResource(R.string.language_continue_english))
                }
            }
        )
    }
}

@Composable
private fun StatusCard(
    title: String,
    subtitle: String,
    isEnabled: Boolean,
    icon: @Composable () -> Unit,
    iconBackground: Color
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f))
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(iconBackground), contentAlignment = Alignment.Center) { icon() }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(subtitle, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f))
                }
            }
            Spacer(Modifier.width(8.dp))
            StatusBadge(isEnabled = isEnabled)
        }
    }
}

@Composable
private fun LanguageChoice(tag: String, label: String, selectedTag: String, onSelected: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(onClick = onSelected).padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selectedTag == tag, onClick = onSelected)
        Text(label, modifier = Modifier.padding(start = 4.dp), style = MaterialTheme.typography.bodyLarge)
    }
}


private fun nativeLanguageName(tag: String): String = when (tag.lowercase(java.util.Locale.ROOT)) {
    "en" -> "English"; "ru" -> "Русский"; "hi" -> "हिन्दी"; "es" -> "Español"; "fr" -> "Français"
    "ar" -> "العربية"; "zh-cn", "zh" -> "简体中文"; "bn" -> "বাংলা"; "de" -> "Deutsch"
    "id" -> "Bahasa Indonesia"; "it" -> "Italiano"; "ja" -> "日本語"; "ko" -> "한국어"
    "pt-br", "pt" -> "Português (Brasil)"; "tr" -> "Türkçe"; "vi" -> "Tiếng Việt"; else -> tag
}
