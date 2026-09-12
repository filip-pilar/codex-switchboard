import Foundation
import Darwin

public enum SecureFiles {
    public static func check(_ url: URL) throws {
        let path = url.path
        guard path.hasPrefix("/"), !path.split(separator: "/").contains("..") else { throw CocoaError(.fileReadInvalidFileName) }
        var current = ""
        for component in path.split(separator: "/") {
            current += "/" + component
            var metadata = stat()
            if lstat(current, &metadata) != 0 {
                if errno == ENOENT { return }
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
            let kind = metadata.st_mode & S_IFMT
            guard kind != S_IFLNK,
                  current == path ? (kind == S_IFDIR || kind == S_IFREG) : kind == S_IFDIR,
                  metadata.st_uid == getuid() || metadata.st_uid == 0 else {
                throw NSError(domain: "Switchboard.Storage", code: 1, userInfo: [NSLocalizedDescriptionKey: "A protected path is a symbolic link, an unsupported file, or owned by another user."])
            }
        }
    }
    public static func read(_ url: URL, limit: Int = 16 * 1024 * 1024) throws -> Data {
        try check(url)
        let fd = open(url.path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        defer { _ = close(fd) }
        var metadata = stat()
        guard fstat(fd, &metadata) == 0, metadata.st_mode & S_IFMT == S_IFREG,
              metadata.st_uid == getuid(), metadata.st_size <= limit else { throw CocoaError(.fileReadNoPermission) }
        var result = Data(), buffer = [UInt8](repeating: 0, count: 65536)
        while true {
            let count = Darwin.read(fd, &buffer, buffer.count)
            guard count >= 0 else { throw POSIXError(.EIO) }
            if count == 0 { break }
            result.append(contentsOf: buffer.prefix(count))
            guard result.count <= limit else { throw CocoaError(.fileReadTooLarge) }
        }
        return result
    }
    public static func directory(_ url: URL) throws {
        try check(url)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        guard chmod(url.path, 0o700) == 0 else { throw POSIXError(.EACCES) }
    }
    public static func write(_ data: Data, to url: URL, mode: mode_t = 0o600) throws {
        try check(url)
        try directory(url.deletingLastPathComponent())
        let temporary = url.deletingLastPathComponent().appendingPathComponent(".switchboard-\(UUID().uuidString).tmp")
        let fd = open(temporary.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode)
        guard fd >= 0 else { throw POSIXError(.EACCES) }
        var closed = false
        defer { if !closed { _ = close(fd) }; _ = unlink(temporary.path) }
        try data.withUnsafeBytes { bytes in
            var offset = 0
            while offset < bytes.count {
                let count = Darwin.write(fd, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
                guard count > 0 else { throw POSIXError(.EIO) }
                offset += count
            }
        }
        guard fsync(fd) == 0 else { throw POSIXError(.EIO) }
        _ = close(fd); closed = true
        try check(url)
        guard rename(temporary.path, url.path) == 0 else { throw POSIXError(.EIO) }
    }
}
