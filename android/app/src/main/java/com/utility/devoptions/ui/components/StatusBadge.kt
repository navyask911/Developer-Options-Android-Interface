package com.utility.devoptions.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.utility.devoptions.ui.theme.StatusActiveContainer
import com.utility.devoptions.ui.theme.StatusActiveGreen
import com.utility.devoptions.ui.theme.StatusActiveText
import com.utility.devoptions.ui.theme.StatusInactiveContainer
import com.utility.devoptions.ui.theme.StatusInactiveGray
import com.utility.devoptions.ui.theme.StatusInactiveText

@Composable
fun StatusBadge(
    isEnabled: Boolean,
    modifier: Modifier = Modifier
) {
    val bgColor = if (isEnabled) StatusActiveContainer else StatusInactiveContainer
    val contentColor = if (isEnabled) StatusActiveText else StatusInactiveText
    val dotColor = if (isEnabled) StatusActiveGreen else StatusInactiveGray
    val labelText = if (isEnabled) "ACTIVE (ON)" else "DISABLED (OFF)"

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bgColor)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(dotColor)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Icon(
            imageVector = if (isEnabled) Icons.Filled.CheckCircle else Icons.Filled.RemoveCircleOutline,
            contentDescription = null,
            tint = dotColor,
            modifier = Modifier.size(14.dp)
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = labelText,
            color = contentColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.5.sp
        )
    }
}
