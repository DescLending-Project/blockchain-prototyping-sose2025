
use k256::{
    ecdsa::{SigningKey, VerifyingKey, Signature, signature::Signer},
    EncodedPoint
};use once_cell::sync::OnceCell;
use std::error::Error;

use sha2::{Sha512, Digest};

use rand_core::OsRng;
use hex;

pub struct KeyMaterial {
    pub signing_key: SigningKey,
}

impl KeyMaterial {
    pub fn new() -> Self {
        let signing_key = SigningKey::random(&mut OsRng);
        Self { signing_key }
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
static KEY_MATERIAL: OnceCell<KeyMaterial> = OnceCell::new();

pub async fn init_key_material_from_tappd_socket() -> Result<(), Box<dyn Error>> {   
    // Set KEY_MATERIAL
    KEY_MATERIAL
        .set(KeyMaterial::new())
        .map_err(|_| "Key material already initialized")?;

    Ok(())
}

/// Get a reference to the initialized key material
///
/// # Panics
/// Panics if `init_key_material()` was never called.
pub fn get_key_material() -> &'static KeyMaterial {
    KEY_MATERIAL.get().expect("Key material not initialized")
}

/// Safe optional getter (returns None if not initialized)
pub fn try_get_key_material() -> Option<&'static KeyMaterial> {
    KEY_MATERIAL.get()
}
