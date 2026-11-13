# MeshLink ProGuard rules

# Keep JSON/network model classes if added via reflection
-keep class com.meshlink.app.model.** { *; }
-keep class com.meshlink.app.api.** { *; }

# Keep mesh frame constants (used by native byte layout)
-keep class com.meshlink.app.mesh.MeshFrame { *; }

# Kotlin metadata
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-dontwarn kotlinx.**
