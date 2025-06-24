use actix_web::body::BoxBody;

use actix_web::{dev::ServiceRequest, Error, HttpResponse};
use actix_web::dev::{Service, Transform};
use futures_util::future::{ok, Ready, LocalBoxFuture};
use std::rc::Rc;
use crate::config;

pub struct ApiKeyAuth;

impl<S, B> Transform<S, ServiceRequest> for ApiKeyAuth
where
    S: Service<ServiceRequest, Response = actix_web::dev::ServiceResponse<B>, Error = Error> + 'static,
    B: actix_web::body::MessageBody + 'static, // <-- Add this bound
{
    type Response = actix_web::dev::ServiceResponse<BoxBody>; // <-- Change to BoxBody
    type Error = Error;
    type InitError = ();
    type Transform = ApiKeyAuthMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(ApiKeyAuthMiddleware {
            service: Rc::new(service),
        })
    }
}

pub struct ApiKeyAuthMiddleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for ApiKeyAuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = actix_web::dev::ServiceResponse<B>, Error = Error> + 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = actix_web::dev::ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&self, ctx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(ctx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let api_key = config::get_api_key();

        let authorized = req
            .headers()
            .get("x-api-key")
            .and_then(|v| v.to_str().ok())
            .map_or(false, |key| key == api_key);

        let srv = self.service.clone();

        Box::pin(async move {
            if authorized {
                let res = srv.call(req).await?;
                Ok(res.map_into_boxed_body())
            } else {
                let res = req.into_response(HttpResponse::Unauthorized().finish());
                Ok(res.map_into_boxed_body())
            }
        })
    }
}