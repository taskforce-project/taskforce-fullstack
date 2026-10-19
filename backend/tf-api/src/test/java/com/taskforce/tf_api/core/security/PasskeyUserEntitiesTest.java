package com.taskforce.tf_api.core.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.web.webauthn.api.Bytes;
import org.springframework.security.web.webauthn.api.ImmutablePublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialUserEntity;

import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
@DisplayName("PasskeyUserEntities : les comptes TaskForce vus par WebAuthn")
class PasskeyUserEntitiesTest {

    private static final Bytes HANDLE = Bytes.random();

    @Mock private UserRepository userRepository;
    @InjectMocks private PasskeyUserEntities entities;

    private static User ada(String handle) {
        return User.builder().id(7L).email("ada@example.com").displayName("Ada Lovelace").passkeyHandle(handle).isActive(true).build();
    }

    @Test
    @DisplayName("un compte se lit par son identifiant WebAuthn : son adresse comme nom, son nom affiché")
    void reads_by_handle() {
        when(userRepository.findByPasskeyHandle(HANDLE.toBase64UrlString())).thenReturn(Optional.of(ada(HANDLE.toBase64UrlString())));

        PublicKeyCredentialUserEntity entity = entities.findById(HANDLE);

        assertThat(entity.getName()).isEqualTo("ada@example.com");
        assertThat(entity.getDisplayName()).isEqualTo("Ada Lovelace");
        assertThat(entity.getId()).isEqualTo(HANDLE);
        assertThat(entities.findById(null)).isNull();
    }

    @Test
    @DisplayName("par son adresse, seulement s'il a déjà un identifiant WebAuthn")
    void reads_by_address_once_it_has_a_handle() {
        when(userRepository.findByEmail("ada@example.com")).thenReturn(Optional.of(ada(null)));
        assertThat(entities.findByUsername("ada@example.com")).isNull();

        when(userRepository.findByEmail("ada@example.com")).thenReturn(Optional.of(ada(HANDLE.toBase64UrlString())));
        assertThat(entities.findByUsername("ada@example.com").getId()).isEqualTo(HANDLE);
        assertThat(entities.findByUsername(null)).isNull();
    }

    @Test
    @DisplayName("l'identifiant tiré à la première passkey est gardé, puis ne change plus")
    void keeps_the_first_handle() {
        User fresh = ada(null);
        when(userRepository.findByEmail("ada@example.com")).thenReturn(Optional.of(fresh));

        entities.save(ImmutablePublicKeyCredentialUserEntity.builder().name("ada@example.com").id(HANDLE).displayName("Ada").build());
        assertThat(fresh.getPasskeyHandle()).isEqualTo(HANDLE.toBase64UrlString());

        entities.save(ImmutablePublicKeyCredentialUserEntity.builder().name("ada@example.com").id(Bytes.random()).displayName("Ada").build());
        assertThat(fresh.getPasskeyHandle()).isEqualTo(HANDLE.toBase64UrlString());
        verify(userRepository).save(fresh);
    }

    @Test
    @DisplayName("sans nom affiché, l'adresse en tient lieu ; le retrait de l'identifiant ne touche à rien")
    void display_name_and_delete() {
        User plain = User.builder().id(7L).email("ada@example.com").passkeyHandle(HANDLE.toBase64UrlString()).build();

        assertThat(PasskeyUserEntities.entity(plain).getDisplayName()).isEqualTo("ada@example.com");
        entities.delete(HANDLE);
        verify(userRepository, never()).save(any());
    }
}
