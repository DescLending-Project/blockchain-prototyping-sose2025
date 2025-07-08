use crate::types::*;
use crate::types::KeyManagerError;
use hex;
use hyper::{Body, Client, Request};
use hyperlocal::{UnixClientExt, Uri};
use p256::{
    EncodedPoint,
    ecdsa::{Signature, VerifyingKey, SigningKey, signature::Signer},
};

use p256::pkcs8::DecodePrivateKey;

use once_cell::sync::OnceCell;
use rand_core::OsRng;
use serde_json::json;
use sha2::{Digest, Sha512};

pub struct KeyMaterial {
    pub signing_key: SigningKey,
    pub source: KeySource,
    pub certificate_chain: Option<Vec<String>>,

}

#[derive(Debug, Clone, PartialEq)]
pub enum KeySource {
    Tappd,
    Random,
}

impl KeyMaterial {
    pub fn new_random() -> Self {
        let signing_key = SigningKey::random(&mut OsRng);
        Self {
            signing_key,
            source: KeySource::Random,
            certificate_chain: None,
        }
    }

    pub fn from_get_key_response(response: &GetKeyResponse) -> Result<Self, String> {
        let signing_key = match SigningKey::from_pkcs8_pem(&response.key) {
            Ok(key) => key,
            Err(e) => {
                eprintln!("Failed to create signing key from Tappd key: {}", e);
                return Ok(KeyMaterial::new_random());
            }
        };
        Ok(Self {
            signing_key,
            source: KeySource::Tappd,
            certificate_chain: Some(response.certificate_chain.clone()),
        })
    }

    pub fn public_key_bytes(&self) -> Vec<u8> {
        self.signing_key
            .verifying_key()
            .to_encoded_point(false)
            .as_bytes()
            .to_vec()
    }

    pub fn encode_verify_key(&self) -> String {
        let pub_key = self.public_key_bytes();
        hex::encode(pub_key)
    }

    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key().clone()
    }

    pub fn verifying_key_from_hex_encoded(
        &self,
        hex_encoded: &str,
    ) -> Result<VerifyingKey, String> {
        let bytes = hex::decode(hex_encoded).map_err(|e| e.to_string())?;
        let point = EncodedPoint::from_bytes(&bytes).map_err(|e| e.to_string())?;
        VerifyingKey::from_encoded_point(&point).map_err(|e| e.to_string())
    }

    pub fn report_data_from_key(&self) -> String {
        let pub_key = self.public_key_bytes();
        let hash = Sha512::digest(&pub_key);
        format!("0x{}", hex::encode(hash))
    }

    pub fn sign_message(&self, message: &[u8]) -> Signature {
        self.signing_key.sign(message)
    }
}

static KEY_MATERIAL: OnceCell<KeyMaterial> = OnceCell::new();

/// Calls /prpc/Tappd.DeriveKey?json over Unix socket and returns the key ID
pub async fn derive_key_from_tappd() -> Result<GetKeyResponse, KeyManagerError> {
    // 1. Prepare client and endpoint URI
    let client = Client::unix();
    let uri: hyperlocal::Uri = Uri::new("/var/run/tappd.sock", "/prpc/Tappd.DeriveKey?json").into();

    // 2. Empty JSON body
    let req = Request::post(uri)
        .header("Content-Type", "application/json")
        .body(Body::from(json!({}).to_string()))
        .map_err(|e| KeyManagerError {
            message: format!("Failed to build request: {}", e),
        })?;

    // 3. Send request
    let res = client.request(req).await.map_err(|e| KeyManagerError {
        message: format!("Failed to send request: {}", e),
    })?;


    // 4. Read body
    let body_bytes = hyper::body::to_bytes(res.into_body())
        .await
        .map_err(|e| KeyManagerError {
            message: format!("Failed to read response body: {}", e),
        })?;

    // 5. Parse JSON
    let parsed: GetKeyResponse =
        serde_json::from_slice(&body_bytes).map_err(|e| KeyManagerError {
            message: format!("Failed to parse GetKeyResponse: {}", e),
        })?;
    Ok(parsed)
}

pub async fn init_key_material_from_tappd_socket() -> Result<(), KeyManagerError> {
    let key_material = match derive_key_from_tappd().await {
        Ok(key_response) => {
            // Use the key from Tappd
            println!("Successfully derived key from Tappd");
            match KeyMaterial::from_get_key_response(&key_response) {
                Ok(km) => {
                    println!("Successfully created signing key from Tappd key");
                    km
                }
                Err(e) => {
                    println!("Error creating signing key from Tappd key: {}", e);
                    println!("Falling back to random key generation");
                    KeyMaterial::new_random()
                }
            }
        }
        Err(e) => {
            // Fall back to random key generation
            println!("Error deriving key from Tappd: {:?}", e);
            println!("Falling back to random key generation");
            KeyMaterial::new_random()
        }
    };

    // Log the key source
    println!("Key source: {:?}", key_material.source);

    // Set KEY_MATERIAL
    KEY_MATERIAL
        .set(key_material)
        .map_err(|_| KeyManagerError {
            message: "Key material already initialized".to_string(),
        })?;

    Ok(())
}


/// Safe optional getter (returns None if not initialized)
pub fn try_get_key_material() -> Option<&'static KeyMaterial> {
    KEY_MATERIAL.get()
}
