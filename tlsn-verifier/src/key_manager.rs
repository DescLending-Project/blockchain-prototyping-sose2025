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

/// Holds a private ECDSA signing key, its origin, and optional certificate chain
pub struct KeyMaterial {
    pub signing_key: SigningKey,
    pub source: KeySource,
    pub certificate_chain: Option<Vec<String>>, // Chain of x509 certs, PEM-encoded
}

/// Indicates how the key was provisioned
#[derive(Debug, Clone, PartialEq)]
pub enum KeySource {
    Tappd,   // Key was provisioned via Tappd
    Random,  // Key was generated locally
}

impl KeyMaterial {
    /// Generate a new key locally using randomness
    pub fn new_random() -> Self {
        let signing_key = SigningKey::random(&mut OsRng);
        Self {
            signing_key,
            source: KeySource::Random,
            certificate_chain: None,
        }
    }

    /// Create KeyMaterial from a response returned by Tappd
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

    /// Returns the raw public key bytes in uncompressed format (04 || X || Y)
    pub fn public_key_bytes(&self) -> Vec<u8> {
        self.signing_key
            .verifying_key()
            .to_encoded_point(false)
            .as_bytes()
            .to_vec()
    }

    /// Returns hex-encoded public key
    pub fn encode_verify_key(&self) -> String {
        let pub_key = self.public_key_bytes();
        hex::encode(pub_key)
    }

    /// Returns the verifying key corresponding to the signing key
    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key().clone()
    }

    /// Constructs verifying key from a hex-encoded public key string
    pub fn verifying_key_from_hex_encoded(
        &self,
        hex_encoded: &str,
    ) -> Result<VerifyingKey, String> {
        let bytes = hex::decode(hex_encoded).map_err(|e| e.to_string())?;
        let point = EncodedPoint::from_bytes(&bytes).map_err(|e| e.to_string())?;
        VerifyingKey::from_encoded_point(&point).map_err(|e| e.to_string())
    }

    /// Computes a report hash (SHA-512) of the public key to embed in attestation
    pub fn report_data_from_key(&self) -> String {
        let pub_key = self.public_key_bytes();
        let hash = Sha512::digest(&pub_key);
        format!("0x{}", hex::encode(hash))
    }

    /// Signs the given message with the private key
    pub fn sign_message(&self, message: &[u8]) -> Signature {
        self.signing_key.sign(message)
    }
}

/// Singleton that stores the initialized KeyMaterial
static KEY_MATERIAL: OnceCell<KeyMaterial> = OnceCell::new();

/// Calls the Tappd Unix socket endpoint `/prpc/Tappd.DeriveKey?json`
/// to derive and retrieve a key pair and optional certificate chain
pub async fn derive_key_from_tappd() -> Result<GetKeyResponse, KeyManagerError> {
    // 1. Prepare HTTP client and Unix socket URI
    let client = Client::unix();
    let uri: hyperlocal::Uri = Uri::new("/var/run/tappd.sock", "/prpc/Tappd.DeriveKey?json").into();

    // 2. Create a POST request with an empty JSON body
    let req = Request::post(uri)
        .header("Content-Type", "application/json")
        .body(Body::from(json!({}).to_string()))
        .map_err(|e| KeyManagerError {
            message: format!("Failed to build request: {}", e),
        })?;

    // 3. Send request over the Unix socket
    let res = client.request(req).await.map_err(|e| KeyManagerError {
        message: format!("Failed to send request: {}", e),
    })?;

    // 4. Read response body bytes
    let body_bytes = hyper::body::to_bytes(res.into_body())
        .await
        .map_err(|e| KeyManagerError {
            message: format!("Failed to read response body: {}", e),
        })?;

    // 5. Parse the JSON response into GetKeyResponse
    let parsed: GetKeyResponse =
        serde_json::from_slice(&body_bytes).map_err(|e| KeyManagerError {
            message: format!("Failed to parse GetKeyResponse: {}", e),
        })?;
    Ok(parsed)
}

/// Initializes the global KEY_MATERIAL by deriving the key from Tappd.
/// If Tappd fails, falls back to generating a random key locally.
pub async fn init_key_material_from_tappd_socket() -> Result<(), KeyManagerError> {
    let key_material = match derive_key_from_tappd().await {
        Ok(key_response) => {
            // Try to parse key and certificate from response
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
            // If Tappd fails, generate a local key instead
            println!("Error deriving key from Tappd: {:?}", e);
            println!("Falling back to random key generation");
            KeyMaterial::new_random()
        }
    };


    // Set the global KEY_MATERIAL (only once)
    KEY_MATERIAL
        .set(key_material)
        .map_err(|_| KeyManagerError {
            message: "Key material already initialized".to_string(),
        })?;

    Ok(())
}

/// Safe getter: returns `Some(&KeyMaterial)` if already initialized
pub fn try_get_key_material() -> Option<&'static KeyMaterial> {
    KEY_MATERIAL.get()
}
