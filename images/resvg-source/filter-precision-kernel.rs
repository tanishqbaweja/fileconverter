// Float arithmetic for the private final-merge candidate. No file or image I/O.
fn within_merge_decode(pixel: [u8; 4], linear: bool) -> [f32; 4] {
    let alpha = pixel[3] as f32 / 255.0;
    if pixel[3] == 0 { return [0.0; 4]; }
    let channel = |value: u8| {
        if linear { return value as f32 / 255.0; }
        let straight = value as f32 / pixel[3] as f32;
        let decoded = if straight <= 0.04045 { straight / 12.92 }
            else { ((straight + 0.055) / 1.055).powf(2.4) };
        decoded * alpha
    };
    [channel(pixel[0]), channel(pixel[1]), channel(pixel[2]), alpha]
}

fn within_merge_over(destination: &mut [f32; 4], source: [f32; 4]) {
    let inverse_alpha = 1.0 - source[3];
    for channel in 0..4 {
        destination[channel] = source[channel] + destination[channel] * inverse_alpha;
    }
}

fn within_merge_encode(pixel: [f32; 4]) -> [u8; 4] {
    let alpha = pixel[3].clamp(0.0, 1.0);
    if alpha == 0.0 { return [0; 4]; }
    let alpha_byte = (alpha * 255.0 + 0.5) as u8;
    let channel = |value: f32| {
        let straight = (value / alpha).clamp(0.0, 1.0);
        let encoded = if straight <= 0.0031308 { straight * 12.92 }
            else { 1.055 * straight.powf(1.0 / 2.4) - 0.055 };
        ((encoded * alpha * 255.0 + 0.5) as u8).min(alpha_byte)
    };
    [channel(pixel[0]), channel(pixel[1]), channel(pixel[2]), alpha_byte]
}

#[cfg(test)]
mod within_merge_precision_tests {
    use super::*;
    #[test]
    fn all_opaque_channel_values_round_trip_without_the_observed_loss() {
        for value in 0..=255 {
            for channel in 0..3 {
                let mut pixel = [0, 0, 0, 255]; pixel[channel] = value;
                assert_eq!(within_merge_encode(within_merge_decode(pixel, false)), pixel);
            }
        }
        let original = [29, 11, 17, 255];
        assert_eq!(within_merge_encode(within_merge_decode(original, false)), original);
    }
    #[test]
    fn every_legal_premultiplied_channel_alpha_pair_round_trips() {
        for alpha in 1..=255 {
            for value in 0..=alpha {
                let pixel = [value, value, value, alpha];
                assert_eq!(within_merge_encode(within_merge_decode(pixel, false)), pixel);
            }
        }
        assert_eq!(within_merge_encode(within_merge_decode([0; 4], false)), [0; 4]);
    }
    #[test]
    fn mixed_space_source_over_matches_independent_f64_reference_to_one_lsb() {
        let mut seed = 314159265u32;
        for _case in 0..10000 {
            let mut actual = [0.0f32; 4]; let mut reference = [0.0f64; 4];
            for layer in 0..4 {
                let mut next = || { seed = seed.wrapping_mul(1664525).wrapping_add(1013904223); (seed >> 24) as u8 };
                let alpha = next();
                let pixel = [next().min(alpha), next().min(alpha), next().min(alpha), alpha];
                let linear = layer % 2 == 0;
                within_merge_over(&mut actual, within_merge_decode(pixel, linear));
                let a = alpha as f64 / 255.0;
                for channel in 0..3 {
                    let source = if linear { pixel[channel] as f64 / 255.0 }
                        else if alpha == 0 { 0.0 } else {
                            let value = pixel[channel] as f64 / alpha as f64;
                            (if value <= 0.04045 { value / 12.92 }
                                else { ((value + 0.055) / 1.055).powf(2.4) }) * a
                        };
                    reference[channel] = source + reference[channel] * (1.0 - a);
                }
                reference[3] = a + reference[3] * (1.0 - a);
            }
            let output = within_merge_encode(actual);
            for channel in 0..3 {
                let value = (reference[channel] / reference[3]).clamp(0.0, 1.0);
                let srgb = if value <= 0.0031308 { 12.92 * value }
                    else { 1.055 * value.powf(1.0 / 2.4) - 0.055 };
                let expected = (srgb * reference[3] * 255.0).round() as i16;
                assert!((output[channel] as i16 - expected).abs() <= 1);
                assert!(output[channel] <= output[3]);
            }
            assert_eq!(output[3], (reference[3] * 255.0).round() as u8);
        }
    }
    #[test]
    fn transparent_and_opaque_over_have_the_required_identity_laws() {
        let mut value = within_merge_decode([23, 11, 19, 127], false);
        let before = value; within_merge_over(&mut value, [0.0; 4]); assert_eq!(value, before);
        let opaque = within_merge_decode([29, 11, 17, 255], false);
        within_merge_over(&mut value, opaque); assert_eq!(value, opaque);
        assert_eq!(within_merge_encode(value), [29, 11, 17, 255]);
    }
}
