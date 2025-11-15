#![cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};
use objc::runtime::{Class, Object};

pub fn is_fn_key_pressed() -> Result<bool, ()> {
    unsafe {
        let cls = Class::get("NSProcessInfo").ok_or(())?;
        let shared: *mut Object = msg_send![cls, processInfo];
        if shared.is_null() {
            return Err(());
        }
        // Placeholder: always false for now, until we implement actual Fn detection.
        Ok(false)
    }
}
