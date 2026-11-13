package com.meshlink.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meshlink.app.api.BackendApi
import com.meshlink.app.service.startMeshService

private val Purple = Color(0xFF6750A4)
private val PurpleLight = Color(0xFFEADDFF)
private val PurpleSoft = Color(0xFFF3EDF7)
private val Muted = Color(0xFF625B71)
private val Ink = Color(0xFF1D1B20)

@Composable
fun SignupScreen() {
    val context = LocalContext.current

    var email by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var generatedUin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }

    val gradient = Brush.verticalGradient(
        listOf(Purple, Color(0xFF9C88FF), PurpleLight, Color(0xFFFEF7FF))
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(gradient)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp, vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("MeshLink", fontSize = 38.sp, fontWeight = FontWeight.Bold, color = Purple)
            Spacer(Modifier.height(4.dp))
            Text("Free Secure Messaging", fontSize = 16.sp, color = Muted)
            Spacer(Modifier.height(32.dp))

            OutlinedTextField(
                value = email,
                onValueChange = { email = it; error = "" },
                label = { Text("Email") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = PurpleLight,
                    unfocusedContainerColor = PurpleSoft,
                    focusedBorderColor = Purple,
                    unfocusedBorderColor = Color(0xFFCAC4D0),
                    focusedLabelColor = Purple,
                    unfocusedLabelColor = Muted,
                ),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
            )

            Spacer(Modifier.height(14.dp))

            OutlinedTextField(
                value = displayName,
                onValueChange = { displayName = it; error = "" },
                label = { Text("Display Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = PurpleLight,
                    unfocusedContainerColor = PurpleSoft,
                    focusedBorderColor = Purple,
                    unfocusedBorderColor = Color(0xFFCAC4D0),
                    focusedLabelColor = Purple,
                    unfocusedLabelColor = Muted,
                ),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Text,
                    imeAction = ImeAction.Done,
                ),
            )

            if (error.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Text(error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }

            Spacer(Modifier.height(26.dp))

            Button(
                onClick = {
                    error = ""
                    isLoading = true
                    val api = BackendApi()
                    val uin = api.signupUin(email.trim(), displayName.trim())
                    isLoading = false
                    if (uin != null) {
                        generatedUin = uin
                        // UIN ab set hai — radio mesh ko isi identity ke saath start karo.
                        startMeshService(context, uin)
                    } else {
                        error = "Signup fail hua — email/display name check karein."
                    }
                },
                enabled = !isLoading && email.isNotBlank() && displayName.isNotBlank(),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Purple,
                    contentColor = Color.White,
                ),
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = Color.White,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("Create Free Account", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }

            if (generatedUin.isNotEmpty()) {
                Spacer(Modifier.height(22.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = PurpleLight),
                    shape = RoundedCornerShape(18.dp),
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("Your Unique ID", fontSize = 13.sp, color = Muted)
                        Spacer(Modifier.height(6.dp))
                        Text(generatedUin, fontSize = 21.sp, fontWeight = FontWeight.Bold, color = Purple)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Share this with friends to connect securely",
                            fontSize = 12.sp,
                            color = Muted,
                        )
                    }
                }
            }

            Spacer(Modifier.height(26.dp))
            FeatureItem("✓", "No phone number needed")
            FeatureItem("✓", "End-to-End Encrypted")
            FeatureItem("✓", "Works offline via radio mesh")

            Spacer(Modifier.height(18.dp))
            RadioStatusCard()

            Spacer(Modifier.height(14.dp))
            Text("v1.0.0 · Free Forever", fontSize = 12.sp, color = Color(0xFF9E9A9F))
        }
    }
}

@Composable
private fun RadioStatusCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0x99FFFFFF)),
        shape = RoundedCornerShape(18.dp),
        border = androidx.compose.foundation.BorderStroke(2.dp, Color(0x266750A4)),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "RADIO MESH — NO INTERNET REQUIRED",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Purple,
            )
            Spacer(Modifier.height(10.dp))
            RadioRow("Radio (SMS / cellular)", "city-wide")
            RadioRow("Bluetooth LE", "10–50 m")
            RadioRow("Wi-Fi Direct", "50–200 m")
        }
    }
}

@Composable
private fun RadioRow(name: String, range: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
    ) {
        Box(
            modifier = Modifier
                .size(9.dp)
                .background(Color(0xFF2E7D32), RoundedCornerShape(50)),
        )
        Spacer(Modifier.width(10.dp))
        Text(name, fontSize = 13.sp, color = Ink, modifier = Modifier.weight(1f))
        Text(
            range,
            fontSize = 11.sp,
            color = Muted,
            modifier = Modifier
                .background(PurpleLight, RoundedCornerShape(50))
                .padding(horizontal = 9.dp, vertical = 3.dp),
        )
    }
}

@Composable
private fun FeatureItem(icon: String, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
    ) {
        Box(
            modifier = Modifier
                .size(22.dp)
                .background(PurpleLight, RoundedCornerShape(50)),
            contentAlignment = Alignment.Center,
        ) {
            Text(icon, color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(10.dp))
        Text(text, fontSize = 14.sp, color = Ink)
    }
}
