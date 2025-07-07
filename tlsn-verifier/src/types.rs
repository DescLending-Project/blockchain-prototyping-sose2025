use bincode;
use dstack_sdk::dstack_client::GetQuoteResponse;
use hex;
use k256::ecdsa::VerifyingKey;
use serde::{Deserialize, Serialize};
use tlsn_core::{
    presentation::{Presentation},
};
use k256::ecdsa::Signature;


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
