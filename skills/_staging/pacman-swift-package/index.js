// Package.swift
// swift-tools-version:5.9

import PackageDescription

let package = Package(
    name: "PacManSwift",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "PacManSwift",
            targets: ["PacManSwift"]
        )
    ],
    targets: [
        .target(
            name: "PacManSwift",
            path: "Sources/PacManSwift"
        )
    ]
)