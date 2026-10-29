// Private boundary correction for the pinned five-box approximation.
// The original kernel sizes, rounding and convolution loops remain unchanged.
pub fn apply(sigma_x: f64, sigma_y: f64, mut src: ImageRefMut) {
    let boxes_horz = create_box_gauss(sigma_x as f32);
    let boxes_vert = create_box_gauss(sigma_y as f32);
    let padding_x = within_box_blur_padding(&boxes_horz);
    let padding_y = within_box_blur_padding(&boxes_vert);
    if padding_x == 0 && padding_y == 0 { return; }

    // Keep one zero-extended domain through every pass. Cropping each pass
    // discards intermediate values that must contribute back across the edge.
    let padded_width = src.width.checked_add(padding_x.checked_mul(2)
        .expect("bounded blur halo width overflow"))
        .expect("bounded blur halo width overflow");
    let padded_height = src.height.checked_add(padding_y.checked_mul(2)
        .expect("bounded blur halo height overflow"))
        .expect("bounded blur halo height overflow");
    let pixels = (padded_width as usize).checked_mul(padded_height as usize)
        .expect("bounded blur halo pixel count overflow");
    // This is an additional pre-allocation guard, not a larger Wasm limit.
    // Other live allocations still share the unchanged 96 MiB Wasm maximum.
    assert!(pixels <= 96 * 1024 * 1024 / (2 * std::mem::size_of::<RGBA8>()),
        "bounded blur halo buffers exceed 96 MiB");
    let mut expanded = vec![RGBA8::default(); pixels];
    let width = src.width as usize;
    for y in 0..src.height as usize {
        let from = y * width;
        let to = (y + padding_y as usize) * padded_width as usize + padding_x as usize;
        expanded[to..to + width].copy_from_slice(&src.data[from..from + width]);
    }
    {
        let mut padded = ImageRefMut::new(padded_width, padded_height, &mut expanded);
        let mut backbuf = padded.data.to_vec();
        let mut backbuf = ImageRefMut::new(padded_width, padded_height, &mut backbuf);
        for (box_size_horz, box_size_vert) in boxes_horz.iter().zip(boxes_vert.iter()) {
            let radius_horz = ((box_size_horz - 1) / 2) as usize;
            let radius_vert = ((box_size_vert - 1) / 2) as usize;
            box_blur_impl(radius_horz, radius_vert, &mut backbuf, &mut padded);
        }
    }
    for y in 0..src.height as usize {
        let from = (y + padding_y as usize) * padded_width as usize + padding_x as usize;
        let to = y * width;
        src.data[to..to + width].copy_from_slice(&expanded[from..from + width]);
    }
}

fn within_box_blur_padding(boxes: &[i32; STEPS]) -> u32 {
    boxes.iter().try_fold(0u32, |total, &size| {
        assert!(size > 0 && size % 2 == 1, "bounded blur requires positive odd kernels");
        total.checked_add(((size - 1) / 2) as u32)
    }).expect("bounded blur halo radius overflow")
}
