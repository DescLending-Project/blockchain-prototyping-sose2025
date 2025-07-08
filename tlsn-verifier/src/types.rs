use bincode;
use hex;
use serde::{Deserialize, Serialize};
use tlsn_core::{
    presentation::{Presentation},
};
use anyhow::Result;
use hex::{FromHexError};
use serde_json::{Value, from_str};




#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PresentationJSON {
    pub version: String,
    pub data: String,
    pub meta: Meta,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub notary_url: String,
    pub websocket_proxy_url: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct VerificationResult {
    pub is_valid: bool,
    pub server_name: String,
    pub score : String,
    pub verifying_key: String,
    pub sent_hex_encoded: String,
    pub sent_readable: String,
    pub recv_hex_encoded: String,
    pub recv_readable: String,
    pub time: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct VerificationError {
    pub message: String,
}

impl<E: std::fmt::Display> From<E> for VerificationError {
    fn from(e: E) -> Self {
        VerificationError {
            message: e.to_string(),
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AttestationError {
    pub message: String,
}

impl<E: std::fmt::Display> From<E> for AttestationError {
    fn from(e: E) -> Self {
        AttestationError {
            message: e.to_string(),
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct KeyManagerError {
    pub message: String,
}

impl<E: std::fmt::Display> From<E> for KeyManagerError {
    fn from(e: E) -> Self {
        KeyManagerError {
            message: e.to_string(),
        }
    }
}

#[derive(Deserialize, Serialize)]
pub struct VerificationResponse{
    pub verification: Result<VerificationResult, VerificationError>,
    pub attestation: Result<SignedAttestation, AttestationError>,
}

#[derive(Deserialize, Serialize)]
pub struct SignedAttestation {
    pub quote: String,
    pub signature_hex_encoded: String,
    pub verifying_key_hex_encoded: String,
    pub verifying_key_certificate_chain: Option<Vec<String>>,

}

impl PresentationJSON {
    pub fn from_json_str(json: &str) -> Result<Self, serde_json::Error> {
        return serde_json::from_str(json);
    }

    pub fn to_presentation(&self) -> Result<Presentation, Box<dyn std::error::Error>> {
        let tmp_data: String = self.data.chars().filter(|c| !c.is_whitespace()).collect();
        let raw = hex::decode(&tmp_data)?;
        let presentation: Presentation = bincode::deserialize(&raw)?;
        Ok(presentation)
    }
}



/// Represents an event log entry in the system
#[derive(Serialize, Deserialize)]
pub struct EventLog {
    /// The index of the IMR (Integrity Measurement Register)
    pub imr: u32,
    /// The type of event being logged
    pub event_type: u32,
    /// The cryptographic digest of the event
    pub digest: String,
    /// The type of event as a string
    pub event: String,
    /// The payload data associated with the event
    pub event_payload: String,
}

/// Response containing a key and its signature chain
#[derive(Serialize, Deserialize)]
pub struct GetKeyResponse {
    /// The key in hexadecimal format
    pub key: String,
    /// The chain of certificates verifying the key
    pub certificate_chain: Vec<String>,
}

impl GetKeyResponse {
    pub fn decode_key(&self) -> Result<Vec<u8>, FromHexError> {
        hex::decode(&self.key)
    }

    pub fn decode_certificate_chain(&self) -> Result<Vec<Vec<u8>>, FromHexError> {
        self.certificate_chain.iter().map(hex::decode).collect()
    }
}

/// Response containing a quote and associated event log
#[derive(Serialize, Deserialize)]
pub struct GetQuoteResponse {
    /// The attestation quote in hexadecimal format
    pub quote: String,
    /// The event log associated with the quote
    pub event_log: String,
}

impl GetQuoteResponse {
    pub fn decode_quote(&self) -> Result<Vec<u8>, FromHexError> {
        hex::decode(&self.quote)
    }

    pub fn decode_event_log(&self) -> Result<Vec<EventLog>, serde_json::Error> {
        serde_json::from_str(&self.event_log)
    }
}

/// Response containing instance information and attestation data
#[derive(Serialize, Deserialize)]
pub struct InfoResponse {
    /// The application identifier
    pub app_id: String,
    /// The instance identifier
    pub instance_id: String,
    /// The application certificate
    pub app_cert: String,
    /// Trusted Computing Base information
    pub tcb_info: TcbInfo,
    /// The name of the application
    pub app_name: String,
    /// Whether public logs are enabled
    pub public_logs: bool,
    /// Whether public system information is enabled
    pub public_sysinfo: bool,
    /// The device identifier
    pub device_id: String,
    /// The aggregated measurement register value
    pub mr_aggregated: String,
    /// The hash of the OS image
    pub os_image_hash: String,
    /// Information about the key provider
    pub key_provider_info: String,
    /// The hash of the compose configuration
    pub compose_hash: String,
}

impl InfoResponse {
    pub fn validated_from_value(mut obj: Value) -> Result<Self, serde_json::Error> {
        if let Some(tcb_info_str) = obj.get("tcb_info").and_then(Value::as_str) {
            let parsed_tcb_info: TcbInfo = from_str(tcb_info_str)?;
            obj["tcb_info"] = serde_json::to_value(parsed_tcb_info)?;
        }
        serde_json::from_value(obj)
    }
}

/// Trusted Computing Base information structure
#[derive(Serialize, Deserialize)]
pub struct TcbInfo {
    /// The measurement root of trust
    pub mrtd: String,
    /// The hash of the root filesystem
    pub rootfs_hash: String,
    /// The value of RTMR0 (Runtime Measurement Register 0)
    pub rtmr0: String,
    /// The value of RTMR1 (Runtime Measurement Register 1)
    pub rtmr1: String,
    /// The value of RTMR2 (Runtime Measurement Register 2)
    pub rtmr2: String,
    /// The value of RTMR3 (Runtime Measurement Register 3)
    pub rtmr3: String,
    /// The event log entries
    pub event_log: Vec<EventLog>,
}


