// Core serialization and crypto utilities
use bincode;
use hex;
use serde::{Deserialize, Serialize};
use tlsn_core::presentation::Presentation;
use anyhow::Result;
use hex::FromHexError;
use serde_json::{Value, from_str};

/// Represents a TLSNotary presentation in JSON form, including version info, data payload, and metadata.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PresentationJSON {
    pub version: String,  // Version of the presentation format
    pub data: String,     // Hex-encoded serialized Presentation
    pub meta: Meta,       // Additional metadata such as notary URL
}

/// Metadata associated with a presentation
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub notary_url: String,                    // URL of the notary service
    pub websocket_proxy_url: Option<String>,   // Optional proxy for WebSocket connections
}

/// Structure containing the result of a successful verification
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct VerificationResult {
    pub is_valid: bool,                    // Indicates if the presentation is valid
    pub server_name: String,               // Verified TLS server name
    pub score: String,                     // Score or reputation data extracted from response
    pub verifying_key: String,             // Hex-encoded verifying key
    pub sent_hex_encoded: String,          // Hex-encoded sent message
    pub sent_readable: String,             // Human-readable sent message
    pub recv_hex_encoded: String,          // Hex-encoded received message
    pub recv_readable: String,             // Human-readable received message
    pub time: String,                      // Timestamp of verification
}

/// Error that occurred during the verification process
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct VerificationError {
    pub message: String,                   // Human-readable error message
}

// Allows converting any Display-able error into a VerificationError
impl<E: std::fmt::Display> From<E> for VerificationError {
    fn from(e: E) -> Self {
        VerificationError {
            message: e.to_string(),
        }
    }
}

/// Error that occurred during attestation
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AttestationError {
    pub message: String,
}

// Conversion implementation for AttestationError from any displayable error
impl<E: std::fmt::Display> From<E> for AttestationError {
    fn from(e: E) -> Self {
        AttestationError {
            message: e.to_string(),
        }
    }
}

/// Error structure for key management operations
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct KeyManagerError {
    pub message: String,
}

// Allows any error implementing Display to be wrapped in KeyManagerError
impl<E: std::fmt::Display> From<E> for KeyManagerError {
    fn from(e: E) -> Self {
        KeyManagerError {
            message: e.to_string(),
        }
    }
}

/// Wrapper for both verification result and attestation output
#[derive(Deserialize, Serialize)]
pub struct VerificationResponse {
    pub verification: Result<VerificationResult, VerificationError>, // Result of verification process
    pub attestation: Result<SignedAttestation, AttestationError>,    // Result of attestation (with signature)
}

/// Resulting signed attestation after successful proof
#[derive(Deserialize, Serialize)]
pub struct SignedAttestation {
    pub quote: String,                                // Hex-encoded attestation quote
    pub signature_hex_encoded: String,                // Hex-encoded signature over the attestation
    pub verifying_key_hex_encoded: String,            // Verifying key used to generate the signature
    pub verifying_key_certificate_chain: Option<Vec<String>>, // Optional PEM certificate chain
}

impl PresentationJSON {
    /// Parses a PresentationJSON from a JSON string
    pub fn from_json_str(json: &str) -> Result<Self, serde_json::Error> {
        return serde_json::from_str(json);
    }

    /// Decodes the presentation hex string into a Presentation struct
    pub fn to_presentation(&self) -> Result<Presentation, Box<dyn std::error::Error>> {
        let tmp_data: String = self.data.chars().filter(|c| !c.is_whitespace()).collect();
        let raw = hex::decode(&tmp_data)?;
        let presentation: Presentation = bincode::deserialize(&raw)?;
        Ok(presentation)
    }
}

/// Represents a single entry in the attestation event log
#[derive(Serialize, Deserialize)]
pub struct EventLog {
    pub imr: u32,               // Integrity Measurement Register index
    pub event_type: u32,        // Numeric event type
    pub digest: String,         // Hex-encoded digest of the event
    pub event: String,          // Event type string
    pub event_payload: String,  // Associated payload as a string
}

/// Response containing a derived key and its associated certificate chain
#[derive(Serialize, Deserialize)]
pub struct GetKeyResponse {
    pub key: String,                        // PEM or hex-encoded private key
    pub certificate_chain: Vec<String>,    // Chain of PEM-encoded certificates
}

impl GetKeyResponse {
    /// Decodes the key from hex to bytes
    pub fn decode_key(&self) -> Result<Vec<u8>, FromHexError> {
        hex::decode(&self.key)
    }

    /// Decodes the certificate chain from hex to bytes
    pub fn decode_certificate_chain(&self) -> Result<Vec<Vec<u8>>, FromHexError> {
        self.certificate_chain.iter().map(hex::decode).collect()
    }
}

/// Response containing a quote and associated event log (for attestation)
#[derive(Serialize, Deserialize)]
pub struct GetQuoteResponse {
    pub quote: String,         // Hex-encoded quote
    pub event_log: String,     // JSON-encoded event log
}

impl GetQuoteResponse {
    /// Decode the attestation quote
    pub fn decode_quote(&self) -> Result<Vec<u8>, FromHexError> {
        hex::decode(&self.quote)
    }

    /// Parse the event log JSON into a list of EventLog entries
    pub fn decode_event_log(&self) -> Result<Vec<EventLog>, serde_json::Error> {
        serde_json::from_str(&self.event_log)
    }
}

/// Response structure for metadata/info endpoint, including instance details and security state
#[derive(Serialize, Deserialize)]
pub struct InfoResponse {
    pub app_id: String,              // Application ID
    pub instance_id: String,         // Unique instance ID
    pub app_cert: String,            // Application certificate (PEM)
    pub tcb_info: TcbInfo,           // Trusted Computing Base measurements
    pub app_name: String,            // Application name
    pub public_logs: bool,           // Whether logs are publicly visible
    pub public_sysinfo: bool,        // Whether system info is publicly visible
    pub device_id: String,           // Device identifier
    pub mr_aggregated: String,       // Aggregated measurement hash
    pub os_image_hash: String,       // OS image measurement
    pub key_provider_info: String,   // Description of key provider used
    pub compose_hash: String,        // Docker Compose file hash
}

impl InfoResponse {
    /// Handles the case where `tcb_info` is embedded as a JSON string instead of a structured object
    pub fn validated_from_value(mut obj: Value) -> Result<Self, serde_json::Error> {
        if let Some(tcb_info_str) = obj.get("tcb_info").and_then(Value::as_str) {
            let parsed_tcb_info: TcbInfo = from_str(tcb_info_str)?;
            obj["tcb_info"] = serde_json::to_value(parsed_tcb_info)?;
        }
        serde_json::from_value(obj)
    }
}

/// Represents TCB (Trusted Computing Base) measurements
#[derive(Serialize, Deserialize)]
pub struct TcbInfo {
    pub mrtd: String,          // Measurement root of trust
    pub rootfs_hash: String,   // Filesystem root hash
    pub rtmr0: String,         // Runtime Measurement Register 0
    pub rtmr1: String,         // Runtime Measurement Register 1
    pub rtmr2: String,         // Runtime Measurement Register 2
    pub rtmr3: String,         // Runtime Measurement Register 3
    pub event_log: Vec<EventLog>,  // Related attestation events
}
