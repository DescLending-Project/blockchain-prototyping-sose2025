use std::env;
use dotenvy::dotenv;

pub fn load_env() {
    dotenv().ok();
}

pub fn get_api_key() -> String {
    env::var("TLSN_VERIFIER_API_KEY").expect("API_KEY must be set")
}

pub fn get_host() -> String {
    env::var("TLSN_VERIFIER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string())
}

pub fn get_port() -> u16 {
    env::var("TLSN_VERIFIER_PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .expect("PORT must be a number")
}

pub fn get_server_names() -> Vec<String> {
    env::var("TLSN_VERIFIER_ACCEPTED_SERVER_NAMES")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn get_tlsn_core_version() -> String {
    env::var("TLSN_VERIFIER_ACCEPTED_VERSION").unwrap_or_else(|_| "0.1.0-alpha.10".to_string())
}