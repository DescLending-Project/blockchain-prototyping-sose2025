use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Once;
use lazy_static::lazy_static;
use std::sync::{Arc, Mutex};
use thiserror::Error;
use std::fmt;
use crate::types::{DStackError};
use dstack_sdk::dstack_client::{GetKeyResponse, GetQuoteResponse};

pub struct DStackClient {
    base_url: String,
    client: Client,
}

// Singleton implementation
lazy_static! {
    static ref INSTANCE: Arc<Mutex<Option<DStackClient>>> = Arc::new(Mutex::new(None));
}

static INIT: Once = Once::new();

impl DStackClient {
    // Initialize the singleton instance
    pub fn init(base_url: &str) {
        INIT.call_once(|| {
            let client = DStackClient {
                base_url: base_url.to_string(),
                client: Client::new(),
            };
            *INSTANCE.lock().unwrap() = Some(client);
        });
    }

    // Get the singleton instance
    pub fn get_instance() -> Arc<DStackClient> {
        let instance = INSTANCE.lock().unwrap();
        if let Some(ref client) = *instance {
            // Return the instance as an Arc to share ownership
            Arc::new(client.clone())
        } else {
            panic!("DStackClient not initialized. Call init() first.");
        }
    }

    // Enable cloning for the Arc usage
    pub fn clone(&self) -> Self {
        Self {
            base_url: self.base_url.clone(),
            client: Client::new(), // Create a new reqwest client as it's not Clone
        }
    }
    
    // Process API response based on status code and return appropriate result
    async fn process_response<T: for<'de> Deserialize<'de>>(&self, res: reqwest::Response) -> Result<T, DStackError> {
        match res.status() {
            StatusCode::OK => {
                res.json::<T>().await.map_err(|e| DStackError::ParseError(format!("Failed to parse response: {}", e)))
            },
            StatusCode::BAD_REQUEST => {
                let error_text = res.text().await.unwrap_or_else(|_| "Invalid request parameters".to_string());
                Err(DStackError::BadRequest(error_text))
            },
            StatusCode::NOT_FOUND => {
                Err(DStackError::NotFound("Requested resource not found".to_string()))
            },
            StatusCode::UNAUTHORIZED => {
                Err(DStackError::Unauthorized("Authentication failed".to_string()))
            },
            status if status.is_server_error() => {
                let error_text = res.text().await.unwrap_or_else(|_| format!("Server error: {}", status));
                Err(DStackError::ServerError(error_text))
            },
            _ => {
                let status = res.status();
                let error_text = res.text().await.unwrap_or_else(|_| format!("Unexpected status: {}", status));
                Err(DStackError::ServerError(
                    format!("Unexpected response: {} - {}", status, error_text)
                ))
            }
        }
    }
    
    pub async fn derive_key(&self) -> Result<String, DStackError> {
        let url = format!("{}/dstack/derive-key", self.base_url);
        let res = self.client.get(&url).send().await?;
        let body: GetKeyResponse = self.process_response(res).await?;
        Ok(body.key)
    }

    pub async fn generate_quote(&self, report_data: &str) -> Result<GetQuoteResponse, DStackError> {
        let url = format!("{}/dstack/tdx-quote", self.base_url);
        let res = self.client.post(&url)
            .json(&json!({ "report_data": report_data }))
            .send().await?;
        self.process_response(res).await
    }

    pub async fn is_reachable(&self) -> Result<bool, DStackError> {
        let url = format!("{}/dstack/", self.base_url);
        let res = self.client.get(&url).send().await?;
        
        if res.status().is_success() {
            Ok(true)
        } else {
            Err(DStackError::ServerError(format!(
                "Service not reachable, status: {}", res.status()
            )))
        }
    }

    pub async fn info(&self) -> Result<serde_json::Value, DStackError> {
        let url = format!("{}/dstack/info", self.base_url);
        let res = self.client.get(&url).send().await?;
        self.process_response(res).await
    }
}