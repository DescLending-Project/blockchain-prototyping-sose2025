use k256::{
    ecdsa::{SigningKey, VerifyingKey, Signature, signature::Signer},
    EncodedPoint
};
use once_cell::sync::OnceCell;
use std::error::Error;
use std::sync::{Arc, Mutex};
use std::sync::Once;
use lazy_static::lazy_static;
use dstack_sdk::dstack_client::{GetKeyResponse, GetQuoteResponse};
use crate::dstack_client::DStackClient;
use sha2::{Sha512, Digest};

use rand_core::OsRng;
use hex;

pub struct KeyMaterial {
    pub signing_key: SigningKey,
    dstack_client: Arc<DStackClient>,
}

// Singleton implementation
lazy_static! {
    static ref INSTANCE: Arc<Mutex<Option<KeyMaterial>>> = Arc::new(Mutex::new(None));
}

static INIT: Once = Once::new();

impl KeyMaterial {
    // Initialize the singleton instance
    pub async fn init(dstack_client: Arc<DStackClient>) {
        if INIT.is_completed() {
            return; // Already initialized
        }

        // Initialize directly in this async context
        let key_material = KeyMaterial::new_instance(dstack_client.clone()).await;
        INIT.call_once(|| {
            *INSTANCE.lock().unwrap() = Some(key_material);
        });
    }

    // Initialize synchronously (for non-async contexts)
    pub fn init_sync(dstack_client: Arc<DStackClient>) {
        if INIT.is_completed() {
            return; // Already initialized
        }

        // Only use a separate runtime when not inside an async context
        INIT.call_once(|| {
            // Use block_in_place to avoid nesting runtimes
            let key_material = tokio::task::block_in_place(|| {
                // Use a single-threaded runtime to avoid thread pool overhead
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("Failed to create runtime");
                rt.block_on(KeyMaterial::new_instance(dstack_client.clone()))
            });
            
            *INSTANCE.lock().unwrap() = Some(key_material);
        });
    }

    // Get the singleton instance
    pub fn get_instance() -> Arc<KeyMaterial> {
        let instance = INSTANCE.lock().unwrap();
        if let Some(ref key_material) = *instance {
            // Return the instance as an Arc to share ownership
            Arc::new(key_material.clone())
        } else {
            panic!("KeyMaterial not initialized. Call init() first.");
        }
    }
    
    // Get instance asynchronously (can wait for initialization)
    pub async fn get_instance_async() -> Arc<KeyMaterial> {
        // Check if initialization is complete
        if !INIT.is_completed() {
            // Wait briefly to allow initialization to complete
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        
        Self::get_instance()
    }
    
    // Create a new instance (private, used by init)
    pub async fn new_instance(dstack_client: Arc<DStackClient>) -> Self {
        let signing_key = dstack_client.derive_key().await
            .map_err(|e| format!("Failed to derive key: {}", e))
            .and_then(|key| {
                let key_bytes = hex::decode(key)
                    .map_err(|e| format!("Failed to decode key: {}", e))?;
                SigningKey::from_slice(&key_bytes)
                    .map_err(|e| e.to_string())
            })
            .expect("Failed to create signing key");
        Self { signing_key, dstack_client }
    }

    // Enable cloning for the Arc usage
    pub fn clone(&self) -> Self {
        // For KeyMaterial, we actually need to create a copy with the same key
        // Warning: This is creating a copy of the secret key, which might not be
        // what you want from a security perspective
        Self {
            signing_key: self.signing_key.clone(),
            dstack_client: self.dstack_client.clone(),
        }
    }

    pub fn public_key_bytes(&self) -> Vec<u8> {
        self.signing_key.verifying_key()
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