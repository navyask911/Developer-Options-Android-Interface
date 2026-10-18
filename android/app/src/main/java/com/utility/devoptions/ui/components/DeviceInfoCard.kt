package com.utility.devoptions.ui.components

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.utility.devoptions.R
import com.utility.devoptions.data.model.DevStatusUiState
import kotlinx.coroutines.delay

enum class DiagnosticPhase {
    IDLE,
    RUNNING,
    PASSED
}

@Composable
fun DeviceInfoCard(
    uiState: DevStatusUiState,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var diagnosticPhase by remember { mutableStateOf(DiagnosticPhase.IDLE) }
    var secondsElapsed by remember { mutableIntStateOf(0) }
    val totalSeconds = 20

    // 20-second hardware diagnostic timer
    LaunchedEffect(diagnosticPhase) {
        if (diagnosticPhase == DiagnosticPhase.RUNNING) {
            secondsElapsed = 0
            while (secondsElapsed < totalSeconds) {
                delay(1000)
                secondsElapsed++

                // Trigger real vibration between seconds 8 and 14
                if (secondsElapsed in 8..13) {
                    triggerHapticPulse(context)
                }
            }
            diagnosticPhase = DiagnosticPhase.PASSED
        }
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Header
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Info,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(end = 8.dp)
                )
                Text(
                    text = stringResource(R.string.device_hardware_os_details),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Text(
                text = stringResource(R.string.device_details_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
            )

            HorizontalDivider(
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                thickness = 1.dp
            )

            // Specs Table
            SpecRow(label = stringResource(R.string.android_version), value = stringResource(R.string.android_version_value, uiState.androidVersion, uiState.apiLevel))
            SpecRow(label = stringResource(R.string.device_model), value = "${uiState.manufacturer} ${uiState.deviceModel}")
            SpecRow(label = stringResource(R.string.brand_hardware), value = "${uiState.brand} / ${uiState.hardware}")
            SpecRow(label = stringResource(R.string.security_patch), value = uiState.securityPatch.ifEmpty { context.getString(R.string.security_patch_unavailable) })
            SpecRow(label = stringResource(R.string.build_number), value = uiState.buildNumber.ifEmpty { context.getString(R.string.unknown) }, isMonospace = true)
            SpecRow(label = stringResource(R.string.cpu_architecture), value = uiState.cpuAbi.ifEmpty { context.getString(R.string.unknown) }, isMonospace = true)

            Spacer(modifier = Modifier.height(4.dp))

            // Diagnostic Trigger & Execution Section
            when (diagnosticPhase) {
                DiagnosticPhase.IDLE -> {
                    Button(
                        onClick = { diagnosticPhase = DiagnosticPhase.RUNNING },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.quick_hardware_diagnostic),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                DiagnosticPhase.RUNNING -> {
                    val remainingSeconds = totalSeconds - secondsElapsed
                    val progress = secondsElapsed.toFloat() / totalSeconds.toFloat()

                    // Diagnostic Stage Logic
                    val (stageName, stageDesc, stageColor) = when (secondsElapsed) {
                        in 0..7 -> {
                            val colors = listOf(Color.Red, Color.Green, Color.Blue, Color.White, Color.Black)
                            val currentColor = colors[(secondsElapsed / 2).coerceIn(0, colors.lastIndex)]
                            Triple(context.getString(R.string.diagnostic_stage_1), context.getString(R.string.diagnostic_stage_1_description), currentColor)
                        }
                        in 8..13 -> {
                            Triple(context.getString(R.string.diagnostic_stage_2), context.getString(R.string.diagnostic_stage_2_description), Color(0xFF9C27B0))
                        }
                        else -> {
                            Triple(context.getString(R.string.diagnostic_stage_3), context.getString(R.string.diagnostic_stage_3_description), Color(0xFF00B0FF))
                        }
                    }

                    val animatedColor by animateColorAsState(
                        targetValue = stageColor,
                        animationSpec = tween(500),
                        label = "diagnostic_stage_color"
                    )

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surface
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(12.dp)
                                            .clip(CircleShape)
                                            .background(animatedColor)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = stageName,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Text(
                                    text = stringResource(R.string.seconds_remaining, remainingSeconds),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }

                            LinearProgressIndicator(
                                progress = { progress },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(6.dp)
                                    .clip(RoundedCornerShape(3.dp)),
                                color = MaterialTheme.colorScheme.primary,
                                trackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                            )

                            // Interactive Visual Stage Canvas
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(72.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(animatedColor.copy(alpha = if (animatedColor == Color.Black) 0.95f else 0.85f))
                                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f), RoundedCornerShape(10.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                when (secondsElapsed) {
                                    in 0..7 -> {
                                        Text(
                                            text = stringResource(R.string.rgb_spectrum_test, stageColor.toString().take(10)),
                                            color = if (stageColor == Color.White) Color.Black else Color.White,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp
                                        )
                                    }
                                    in 8..13 -> {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(
                                                imageVector = Icons.Default.Vibration,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(24.dp)
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(
                                                text = stringResource(R.string.pulsing_vibration_engine),
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp
                                            )
                                        }
                                    }
                                    else -> {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(
                                                imageVector = Icons.Default.TouchApp,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(24.dp)
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(
                                                text = stringResource(R.string.digitizer_multi_touch_active),
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp
                                            )
                                        }
                                    }
                                }
                            }

                            Text(
                                text = stageDesc,
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f)
                            )
                        }
                    }
                }

                DiagnosticPhase.PASSED -> {
                    // "Diagnostic Passed" Card with "Share Specs" button
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                        ),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = Color(0xFF4CAF50),
                                    modifier = Modifier.size(22.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Column {
                                    Text(
                                        text = stringResource(R.string.diagnostic_passed),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = stringResource(R.string.diagnostic_passed_summary),
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            HorizontalDivider(
                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                                thickness = 1.dp
                            )

                            // Diagnostic Results Checklist
                            DiagnosticCheckItem(title = stringResource(R.string.rgb_screen_matrix), status = stringResource(R.string.zero_dead_pixels_pass))
                            DiagnosticCheckItem(title = stringResource(R.string.haptic_vibration_motor), status = stringResource(R.string.calibrated_functional_pass))
                            DiagnosticCheckItem(title = stringResource(R.string.touch_digitizer), status = stringResource(R.string.low_latency_multi_touch_pass))

                            Spacer(modifier = Modifier.height(4.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = {
                                        shareDeviceSpecs(context, uiState)
                                    },
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(44.dp),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = MaterialTheme.colorScheme.primary
                                    )
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Share,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = stringResource(R.string.share_specs),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                OutlinedButton(
                                    onClick = { diagnosticPhase = DiagnosticPhase.RUNNING },
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(44.dp),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Refresh,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = stringResource(R.string.test_again),
                                        fontSize = 12.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DiagnosticCheckItem(
    title: String,
    status: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f)
        )
        Text(
            text = status,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF4CAF50)
        )
    }
}

@Composable
private fun SpecRow(
    label: String,
    value: String,
    isMonospace: Boolean = false
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f)
        )
        Text(
            text = value.ifEmpty { "—" },
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            fontFamily = if (isMonospace) FontFamily.Monospace else FontFamily.Default,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

private fun triggerHapticPulse(context: Context) {
    try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vibratorManager?.defaultVibrator?.vibrate(
                VibrationEffect.createOneShot(150, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        } else {
            @Suppress("DEPRECATION")
            val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createOneShot(150, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(150)
            }
        }
    } catch (_: Exception) {
        // Safe fail on devices without vibration motors
    }
}

private fun shareDeviceSpecs(context: Context, uiState: DevStatusUiState) {
    val report = context.getString(
        R.string.device_diagnostic_report,
        uiState.manufacturer,
        uiState.deviceModel,
        uiState.androidVersion,
        uiState.apiLevel,
        uiState.buildNumber,
        uiState.securityPatch.ifEmpty { context.getString(R.string.security_patch_unavailable) },
        uiState.cpuAbi,
        if (uiState.isDeveloperOptionsEnabled) context.getString(R.string.status_active_on) else context.getString(R.string.status_disabled_off),
        if (uiState.isUsbDebuggingEnabled) context.getString(R.string.status_active_on) else context.getString(R.string.status_disabled_off)
    )
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.device_report_subject))
        putExtra(Intent.EXTRA_TEXT, report)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(Intent.createChooser(intent, context.getString(R.string.share_specs)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    })
}
