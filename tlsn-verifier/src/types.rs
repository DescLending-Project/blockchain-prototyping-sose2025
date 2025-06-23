use bincode;
use hex;
use serde::{Deserialize, Serialize};
use tlsn_core::{
    presentation::{Presentation},
};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationJSON {
    pub version: String,
    pub data: String,
    pub meta: Meta,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub notary_url: String,
    pub websocket_proxy_url: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationResult {
    pub is_valid: bool,
    pub server_name: String,
    pub verifying_key: String,
    pub sent: Vec<u8>,
    pub sent_readable: String,
    pub recv: Vec<u8>,
    pub recv_readable: String,
    pub time: String,
}

#[derive(Debug, Serialize)]
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
