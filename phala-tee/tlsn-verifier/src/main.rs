mod attestation;
mod auth;
mod config;
mod key_manager;
mod routes;
mod types;
mod verifier;
mod dstack_client;
use crate::auth::ApiKeyAuth;
use crate::routes::*;
use actix_web::{App, HttpServer};
use dstack_client::DStackClient;
use key_manager::KeyMaterial;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    config::load_env();
    let dstack_service_url = config::get_dstack_service_url();

    DStackClient::init(&dstack_service_url);
    
    KeyMaterial::init(DStackClient::get_instance()).await;

    let host = config::get_host();
    let port = config::get_port();

    println!("Running on http://{}:{}", host, port);
    println!("Accepted Server Names: {:?}", config::get_server_names());
    println!(
        "Accepted TLSN Core Version: {}",
        config::get_tlsn_core_version()
    );
    println!("Environment variables loaded successfully.");

    HttpServer::new(|| {
        App::new()
            .wrap(ApiKeyAuth)
            .service(health_check)
            .service(verify_proof_route)
            .service(attestation_route)
    })
    .bind((host.as_str(), port))?
    .run()
    .await
}
