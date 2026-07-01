package com.example.REMS.Controller;

import com.example.REMS.DTO.TenantDTO;
import com.example.REMS.Service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/tenant")
@RequiredArgsConstructor
public class TenantController {

    private final TenantService tenantService;

    // 계약자 등록
    @Operation(summary = "계약자 등록 (중개사)")
    @PostMapping("/{uid}")
    public ResponseEntity<TenantDTO> createTenant(@PathVariable("uid") String uid,
                                                  @RequestBody TenantDTO dto,
                                                  @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(tenantService.createTenant(uid, dto, userDetails));
    }

    // 내 계약자 목록
    @Operation(summary = "내 계약자 목록 (중개사)")
    @GetMapping("/{uid}")
    public ResponseEntity<List<TenantDTO>> getMyTenants(@PathVariable("uid") String uid,
                                                        @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(tenantService.getMyTenants(uid, userDetails));
    }

    // 계약자 수정
    @Operation(summary = "계약자 수정 (중개사)")
    @PutMapping("/{uid}/{id}")
    public ResponseEntity<TenantDTO> updateTenant(@PathVariable("uid") String uid,
                                                  @PathVariable("id") Long id,
                                                  @RequestBody TenantDTO dto,
                                                  @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(tenantService.updateTenant(uid, id, dto, userDetails));
    }

    // 계약자 삭제
    @Operation(summary = "계약자 삭제 (중개사)")
    @DeleteMapping("/{uid}/{id}")
    public ResponseEntity<TenantDTO> deleteTenant(@PathVariable("uid") String uid,
                                                  @PathVariable("id") Long id,
                                                  @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(tenantService.deleteTenant(uid, id, userDetails));
    }
}
