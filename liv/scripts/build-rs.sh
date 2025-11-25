#!/bin/bash

mkdir -p resources/bin

cd liv-rs

cargo build -r

cp target/release/liv-rs ../resources/bin/liv-rs
